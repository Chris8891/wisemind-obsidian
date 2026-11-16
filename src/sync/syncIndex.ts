import {normalizePath} from 'obsidian';

import type WiseMindObsidianPlugin from '../main';
import type {SyncRecord} from '../types';

import {renamedRecord, scopedKey, splitScopedKey} from './syncRules';

const INDEX_FILE = 'sync-index.json';
const SAVE_DELAY_MS = 1500;
const INDEX_VERSION = 2;

type IndexFile = {version: number; scope?: string; records: Record<string, SyncRecord>};

/**
 * Per-note sync bookkeeping (content hash, mtime, remote id). It grows with the vault, so it lives
 * in its own file instead of data.json, which is rewritten on every settings change.
 * Records are kept per learning space: each space holds its own copy of a note, so switching spaces
 * in WiseMindAI neither loses notes nor creates duplicates when switching back.
 */
export class SyncIndex {
  private records = new Map<string, SyncRecord>();
  private scopes = new Set<string>(['']);
  private scope = '';
  /** Version 1 files had no learning spaces; their records move into the first space that is resolved. */
  private adoptLegacy = false;
  private loaded: Promise<void> | null = null;
  private saveTimer = 0;
  private dirty = false;

  constructor(private plugin: WiseMindObsidianPlugin) {}

  private get filePath() {
    const dir = this.plugin.manifest.dir || `${this.plugin.app.vault.configDir}/plugins/${this.plugin.manifest.id}`;
    return normalizePath(`${dir}/${INDEX_FILE}`);
  }

  load() {
    if (!this.loaded) this.loaded = this.readFile();
    return this.loaded;
  }

  private async readFile() {
    try {
      const adapter = this.plugin.app.vault.adapter;
      if (!(await adapter.exists(this.filePath))) return;
      const parsed = JSON.parse(await adapter.read(this.filePath)) as Partial<IndexFile>;
      this.adoptLegacy = (parsed?.version || 1) < INDEX_VERSION;
      this.scope = String(parsed?.scope || '');
      Object.entries(parsed?.records || {}).forEach(([key, record]) => {
        if (!record || typeof record.contentHash !== 'string') return;
        this.records.set(key, record);
        this.scopes.add(splitScopedKey(key).scope);
      });
    } catch {
      // A damaged index only costs one full re-check; every note is treated as unsynced.
      this.records.clear();
    }
  }

  /** Switches to the learning space that later reads and writes apply to; '' means no space. */
  setScope(scope: string) {
    if (this.adoptLegacy) {
      this.adoptLegacy = false;
      if (scope) this.moveUnscopedRecords(scope);
    }
    if (scope === this.scope) return;
    this.scope = scope;
    this.scopes.add(scope);
    this.scheduleSave();
  }

  private moveUnscopedRecords(scope: string) {
    for (const [key, record] of [...this.records]) {
      if (splitScopedKey(key).scope) continue;
      this.records.delete(key);
      this.records.set(scopedKey(scope, key), record);
    }
    this.scheduleSave();
  }

  get currentScope() {
    return this.scope;
  }

  get(path: string) {
    return this.records.get(scopedKey(this.scope, path)) || null;
  }

  get size() {
    let count = 0;
    for (const key of this.records.keys()) if (splitScopedKey(key).scope === this.scope) count += 1;
    return count;
  }

  /** Records of the current learning space, keyed by note path. */
  *entries(): IterableIterator<[string, SyncRecord]> {
    for (const [key, record] of this.records) {
      const {scope, path} = splitScopedKey(key);
      if (scope === this.scope) yield [path, record];
    }
  }

  set(path: string, record: SyncRecord) {
    this.records.set(scopedKey(this.scope, path), record);
    this.scheduleSave();
  }

  /** A note deleted from the vault is forgotten in every learning space. */
  delete(path: string) {
    let changed = false;
    for (const scope of this.scopes) changed = this.records.delete(scopedKey(scope, path)) || changed;
    if (changed) this.scheduleSave();
  }

  /** A rename moves the record in every learning space, keeping each space's remote file. */
  rename(from: string, to: string) {
    let changed = false;
    for (const scope of this.scopes) {
      const record = this.records.get(scopedKey(scope, from));
      if (!record) continue;
      this.records.delete(scopedKey(scope, from));
      this.records.set(scopedKey(scope, to), renamedRecord(record));
      changed = true;
    }
    if (changed) this.scheduleSave();
  }

  async clear() {
    this.records.clear();
    this.scopes = new Set(['', this.scope]);
    window.clearTimeout(this.saveTimer);
    this.dirty = false;
    try {
      const adapter = this.plugin.app.vault.adapter;
      if (await adapter.exists(this.filePath)) await adapter.remove(this.filePath);
    } catch {
      // Nothing to clean up.
    }
  }

  private scheduleSave() {
    this.dirty = true;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  async flush() {
    window.clearTimeout(this.saveTimer);
    if (!this.dirty) return;
    this.dirty = false;
    const payload: IndexFile = {version: INDEX_VERSION, scope: this.scope, records: Object.fromEntries(this.records)};
    try {
      await this.plugin.app.vault.adapter.write(this.filePath, JSON.stringify(payload));
    } catch {
      this.dirty = true;
    }
  }
}
