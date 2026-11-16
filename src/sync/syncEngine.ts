import {reactive} from 'vue';
import {Notice, type TFile} from 'obsidian';

import {CLIENT_SETTING_PAGES, FEATURES} from '../features';
import type WiseMindObsidianPlugin from '../main';
import {convertObsidianImagesToWiseMindMarkdown} from '../markdownImages';
import {stripSourceMarkers} from '../markers';
import {hasFeature} from '../services/capabilities';
import type {SyncRecord} from '../types';
import {isAbortError, isMembershipLimitError} from '../wisemindApi';

import {createYielder, sha256Hex} from './hash';
import {SyncIndex} from './syncIndex';
import {
  chunk,
  classifyByHash,
  classifyByStat,
  isNoteExcluded,
  matchingRules,
  remainingQuota,
  runPool,
  type SyncNoteRef,
  topicIdsFor,
} from './syncRules';
import {findConflict, pushNote, type SyncConflictItem} from './syncUploader';

export type {SyncConflictItem} from './syncUploader';

const BATCH_SIZE = 20;
const CONCURRENCY = 3;
const PENDING_PREVIEW_LIMIT = 50;
const FAILURE_LIMIT = 50;

export type SyncPendingItem = {path: string; title: string; kind: 'new' | 'changed'};
export type SyncFailureItem = {path: string; title: string; message: string};

type WorkItem = {file: TFile; kind: 'new' | 'changed'; content?: string; hash?: string};

type SyncCounts = {synced: number; changed: number; held: number; matched: number};

const emptyRun = () => ({total: 0, done: 0, uploaded: 0, skipped: 0, failed: 0});

/**
 * One-way incremental sync from the vault to WiseMindAI "My files".
 * Untouched notes are recognised by size and mtime without reading them; changed notes are hashed in
 * idle time, uploaded in batches of 20 with at most 3 requests in flight, and every run can be cancelled.
 * Each finished note is written to the index right away, so an interrupted run resumes where it stopped.
 */
export class SyncEngine {
  readonly index: SyncIndex;
  readonly state = reactive({
    phase: 'idle' as 'idle' | 'scanning' | 'syncing',
    run: emptyRun(),
    lastRunAt: 0,
    scannedAt: 0,
    error: '',
    quotaBlocked: false,
    counts: {synced: 0, changed: 0, held: 0, matched: 0} as SyncCounts,
    pending: [] as SyncPendingItem[],
    conflicts: [] as SyncConflictItem[],
    failures: [] as SyncFailureItem[],
  });
  private controller: AbortController | null = null;
  private queued = new Set<string>();
  /** A scan or full sync asked for while another run was busy; it starts as soon as that run ends. */
  private deferred: 'scan' | 'sync' | null = null;
  private disposed = false;

  constructor(private plugin: WiseMindObsidianPlugin) {
    this.index = new SyncIndex(plugin);
  }

  get running() {
    return this.state.phase !== 'idle';
  }

  private t(key: string, params?: Record<string, unknown>) {
    return this.plugin.t(key, params);
  }

  private noteRef(file: TFile): SyncNoteRef {
    const cache = this.plugin.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter || null;
    const tags = [
      ...(cache?.tags || []).map(item => item.tag),
      ...[frontmatter?.tags].flat().filter(Boolean).map(String),
    ];
    return {path: file.path, tags, frontmatter};
  }

  isExcluded(file: TFile) {
    const settings = this.plugin.settings;
    return isNoteExcluded(this.noteRef(file), {
      ignorePatterns: settings.ignorePatterns,
      respectPrivate: settings.syncRespectPrivate,
    });
  }

  /** Rules matching the note, or [] when it is excluded or too large. */
  rulesFor(file: TFile, trigger?: 'auto') {
    const settings = this.plugin.settings;
    if (file.extension !== 'md' || file.stat.size > settings.maxFileSizeKb * 1024) return [];
    const ref = this.noteRef(file);
    if (isNoteExcluded(ref, {ignorePatterns: settings.ignorePatterns, respectPrivate: settings.syncRespectPrivate})) return [];
    const rules = matchingRules(settings.syncRules, ref);
    return trigger ? rules.filter(rule => rule.trigger === trigger) : rules;
  }

  candidates(paths?: string[]) {
    const files = paths
      ? paths.map(path => this.plugin.app.vault.getAbstractFileByPath(path)).filter((file): file is TFile => Boolean((file as TFile)?.stat))
      : this.plugin.app.vault.getMarkdownFiles();
    return files.filter(file => this.rulesFor(file).length > 0);
  }

  /** Reads the note the same way every time so the hash matches what the desktop stores. */
  private async readContent(file: TFile) {
    const raw = await this.plugin.app.vault.cachedRead(file);
    return convertObsidianImagesToWiseMindMarkdown(this.plugin.app, stripSourceMarkers(raw), file.path);
  }

  /**
   * Points the index at the learning space files go to: the bound one, or the space active in
   * WiseMindAI. When it cannot be asked (offline, old client) the last known space is kept.
   */
  private async resolveScope() {
    await this.index.load();
    let scope = this.plugin.settings.workspaceId;
    if (!scope) {
      if (!this.plugin.connected || !hasFeature(FEATURES.workspace)) return;
      try {
        scope = (await this.plugin.api.getWorkspaceState())?.activeWorkspaceId || '';
      } catch {
        return;
      }
    }
    this.index.setScope(scope);
  }

  /** Splits candidates into work and untouched notes; only notes with a changed mtime are read. */
  private async classify(files: TFile[], signal: AbortSignal) {
    await this.resolveScope();
    const work: WorkItem[] = [];
    const counts: SyncCounts = {synced: 0, changed: 0, held: 0, matched: files.length};
    const maybeYield = createYielder();
    for (const file of files) {
      if (signal.aborted) break;
      const record = this.index.get(file.path);
      let kind = classifyByStat(file.stat, record);
      let content: string | undefined;
      let hash: string | undefined;
      if (kind === null) {
        content = await this.readContent(file);
        hash = await sha256Hex(content);
        kind = classifyByHash(hash, record);
        // Touched but identical: remember the new mtime so the next check skips reading it.
        if (kind === 'unchanged' && record) this.index.set(file.path, {...record, mtime: file.stat.mtime, size: file.stat.size});
      }
      if (kind === 'held') counts.held += 1;
      else if (kind === 'unchanged') counts.synced += 1;
      else {
        counts.changed += 1;
        // Notes already known to WiseMindAI are updates even when renamed, so they never use quota.
        work.push({file, kind: record?.remoteId ? 'changed' : kind, content, hash});
      }
      await maybeYield();
    }
    return {work, counts};
  }

  private applyScan(work: WorkItem[], counts: SyncCounts) {
    this.state.counts = counts;
    this.state.pending = work.slice(0, PENDING_PREVIEW_LIMIT).map(item => ({
      path: item.file.path,
      title: item.file.basename,
      kind: item.kind,
    }));
    this.state.scannedAt = Date.now();
  }

  /** Refreshes counts and the pending list without uploading anything. */
  async scan() {
    if (this.running) {
      this.deferred ??= 'scan';
      return;
    }
    const controller = new AbortController();
    this.controller = controller;
    this.state.phase = 'scanning';
    try {
      const {work, counts} = await this.classify(this.candidates(), controller.signal);
      if (!controller.signal.aborted) this.applyScan(work, counts);
    } finally {
      this.finish(controller);
      this.runDeferred();
    }
  }

  /** Queues paths while offline or busy; they are flushed on the next run. */
  queue(paths: string[]) {
    paths.forEach(path => this.queued.add(path));
  }

  get queuedCount() {
    return this.queued.size;
  }

  async flushQueued() {
    if (!this.queued.size || this.running) return;
    const paths = [...this.queued];
    this.queued.clear();
    await this.sync({paths, silent: true});
  }

  async sync(options: {paths?: string[]; silent?: boolean} = {}) {
    if (this.running) {
      if (options.paths) this.queue(options.paths);
      else this.deferred = 'sync';
      return;
    }
    if (!(await this.plugin.testConnection())) {
      if (options.paths) this.queue(options.paths);
      if (!options.silent) new Notice(this.t('syncRules.offline'));
      return;
    }
    const controller = new AbortController();
    this.controller = controller;
    this.state.phase = 'scanning';
    this.state.error = '';
    this.state.quotaBlocked = false;
    this.state.run = emptyRun();
    if (options.paths) {
      const retried = new Set(options.paths);
      this.state.failures = this.state.failures.filter(item => !retried.has(item.path));
    } else {
      // A full run covers every queued edit as well.
      this.queued.clear();
      this.state.failures = [];
    }
    try {
      const files = this.candidates(options.paths);
      const {work, counts} = await this.classify(files, controller.signal);
      if (!options.paths) this.applyScan(work, counts);
      if (controller.signal.aborted || !work.length) return;
      const allowed = await this.applyQuota(work, options.silent);
      if (!allowed.length) return;
      await this.upload(allowed, controller.signal);
    } catch (error) {
      if (!isAbortError(error)) this.state.error = (error as Error)?.message || this.t('syncRules.failed');
    } finally {
      this.state.lastRunAt = Date.now();
      await this.index.flush();
      this.finish(controller);
      this.reportResult(options.silent);
      // Refresh the counts once the sync page has shown them; the scan only reads stat for untouched notes.
      if (!options.paths || this.state.scannedAt) this.deferred ??= 'scan';
      this.runDeferred();
    }
  }

  /** Uploads the notes that failed in earlier runs again. */
  retryFailed() {
    const paths = this.state.failures.map(item => item.path);
    if (paths.length) void this.sync({paths});
  }

  cancel() {
    this.controller?.abort();
  }

  /** Called on plugin unload: stops the current run, starts nothing new and saves the index. */
  async dispose() {
    this.disposed = true;
    this.deferred = null;
    this.queued.clear();
    this.cancel();
    await this.index.flush();
  }

  private finish(controller: AbortController) {
    if (this.controller === controller) this.controller = null;
    this.state.phase = 'idle';
  }

  /** Starts work that arrived during the last run: a full sync first, then queued edits, then a rescan. */
  private runDeferred() {
    if (this.running || this.disposed) return;
    if (this.deferred === 'sync') {
      this.deferred = null;
      void this.sync();
    } else if (this.queued.size && this.plugin.connected) {
      void this.flushQueued();
    } else if (this.deferred === 'scan') {
      this.deferred = null;
      void this.scan();
    }
  }

  /** New notes count toward the "My files" limit; edits of synced notes do not. */
  private async applyQuota(work: WorkItem[], silent?: boolean) {
    if (!hasFeature(FEATURES.usage)) return work;
    const newCount = work.filter(item => item.kind === 'new').length;
    if (!newCount) return work;
    let remaining: number | null = null;
    try {
      remaining = remainingQuota(await this.plugin.api.getAccountUsage());
    } catch {
      return work;
    }
    if (remaining === null || remaining >= newCount) return work;
    this.state.quotaBlocked = true;
    const message = this.t('syncRules.quotaShort', {count: newCount, remaining});
    if (!silent) this.notifyQuota(message);
    let slots = remaining;
    return work.filter(item => item.kind === 'changed' || (slots -= 1) >= 0);
  }

  notifyQuota(message = this.t('syncRules.quotaReached')) {
    this.plugin.reminders.notify(message, this.t('capability.upgrade'), () => {
      void this.plugin.api.openClientSetting(CLIENT_SETTING_PAGES.subscribe).catch(() => undefined);
    });
  }

  private async upload(work: WorkItem[], signal: AbortSignal) {
    this.state.phase = 'syncing';
    this.state.run.total = work.length;
    this.plugin.statusBar.setSyncProgress(0, work.length);
    for (const batch of chunk(work, BATCH_SIZE)) {
      if (signal.aborted) break;
      await runPool(batch, CONCURRENCY, item => this.uploadOne(item, signal), signal);
    }
  }

  private async uploadOne(item: WorkItem, signal: AbortSignal) {
    const {file} = item;
    try {
      const content = item.content ?? (await this.readContent(file));
      const hash = item.hash ?? (await sha256Hex(content));
      const record = this.index.get(file.path);
      const conflict = record ? await findConflict(this.plugin, {file, record, content, hash}, signal) : null;
      if (conflict) {
        this.state.conflicts = [...this.state.conflicts.filter(entry => entry.path !== file.path), conflict];
        this.state.run.skipped += 1;
        return;
      }
      await this.push(file, content, hash, signal);
      this.state.run.uploaded += 1;
    } catch (error) {
      if (isAbortError(error) || signal.aborted) return;
      if (isMembershipLimitError(error)) {
        this.state.quotaBlocked = true;
        this.controller?.abort();
        this.notifyQuota((error as Error).message || undefined);
        return;
      }
      this.state.run.failed += 1;
      this.recordFailure(file, (error as Error)?.message || this.t('syncRules.failed'));
    } finally {
      this.state.run.done += 1;
      this.plugin.statusBar.setSyncProgress(this.state.run.done, this.state.run.total);
    }
  }

  private recordFailure(file: TFile, message: string) {
    this.state.error = message;
    const rest = this.state.failures.filter(item => item.path !== file.path);
    this.state.failures = [...rest, {path: file.path, title: file.basename, message}].slice(-FAILURE_LIMIT);
  }

  private async push(file: TFile, content: string, hash: string, signal?: AbortSignal) {
    const record = this.index.get(file.path);
    const next = await pushNote(
      this.plugin,
      {file, content, hash, record, topicIds: topicIdsFor(this.rulesFor(file))},
      signal,
    );
    this.index.set(file.path, next);
    this.state.conflicts = this.state.conflicts.filter(item => item.path !== file.path);
    this.state.pending = this.state.pending.filter(item => item.path !== file.path);
    this.state.failures = this.state.failures.filter(item => item.path !== file.path);
  }

  /** Overwrite uploads the Obsidian version; keep marks the note held so it stops syncing. Obsidian is never modified. */
  async resolveConflict(path: string, choice: 'overwrite' | 'keep') {
    const conflict = this.state.conflicts.find(item => item.path === path);
    const file = this.plugin.app.vault.getAbstractFileByPath(path) as TFile | null;
    if (!conflict || !file) {
      this.state.conflicts = this.state.conflicts.filter(item => item.path !== path);
      return;
    }
    if (choice === 'overwrite') {
      const content = await this.readContent(file);
      await this.push(file, content, await sha256Hex(content));
    } else {
      const record = this.index.get(path);
      this.index.set(path, {
        ...(record as SyncRecord),
        held: true,
        remoteContentHash: conflict.remoteHash,
        remoteUpdatedAt: conflict.remoteUpdatedAt,
      });
      this.state.conflicts = this.state.conflicts.filter(item => item.path !== path);
      this.state.counts.held += 1;
    }
    await this.index.flush();
  }

  async restoreHeld() {
    await this.index.load();
    for (const [path, record] of [...this.index.entries()]) {
      if (record.held) this.index.set(path, {...record, held: false, mtime: 0});
    }
    await this.index.flush();
    await this.scan();
  }

  async clearLocalData() {
    this.cancel();
    this.queued.clear();
    this.deferred = null;
    await this.index.clear();
    this.state.conflicts = [];
    this.state.pending = [];
    this.state.failures = [];
    this.state.counts = {synced: 0, changed: 0, held: 0, matched: 0};
    this.state.scannedAt = 0;
  }

  private reportResult(silent?: boolean) {
    const {uploaded, failed, skipped} = this.state.run;
    this.plugin.statusBar.setSyncSummary(this.state.counts.changed, this.state.conflicts.length);
    if (silent || !this.state.run.total) return;
    new Notice(this.t('syncRules.resultNotice', {uploaded, failed, skipped}));
  }
}
