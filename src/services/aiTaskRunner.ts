import {reactive} from 'vue';
import {normalizePath, TFile} from 'obsidian';

import {resolveLanguageSetting} from '../i18n';
import type WiseMindObsidianPlugin from '../main';
import {stripSourceMarkers} from '../markers';
import type {AssistantTaskStep} from '../types';
import {isAbortError} from '../wisemindApi';

import {extractRewriteText} from './editorRewriteActions';

export type AiTaskStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'reverted';

export type AiTaskStepState = {
  step: AssistantTaskStep;
  status: AiTaskStepStatus;
  error?: string;
};

type Snapshot =
  | {kind: 'modify'; path: string; original: string}
  | {kind: 'create'; path: string};

/** Only plain markdown paths inside the vault; the plan comes from a model and is not trusted. */
export const sanitizeTaskPath = (path: string) => {
  const raw = String(path || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!raw || raw.split('/').some(part => part === '..' || part === '.')) return '';
  const withExt = raw.toLowerCase().endsWith('.md') ? raw : `${raw}.md`;
  return normalizePath(withExt);
};

/** Executes a confirmed plan step by step. Every write is snapshotted first so the whole run can be undone. */
export class AiTaskRunner {
  readonly steps: AiTaskStepState[];
  private snapshots: Snapshot[] = [];
  private controller: AbortController | null = null;
  private stopped = false;

  constructor(private plugin: WiseMindObsidianPlugin, private instruction: string, steps: AssistantTaskStep[]) {
    this.steps = reactive(steps.map(step => ({step, status: 'pending' as AiTaskStepStatus})));
  }

  get canUndo() {
    return this.snapshots.length > 0;
  }

  stop() {
    this.stopped = true;
    this.controller?.abort();
  }

  result() {
    const count = (status: AiTaskStepStatus) => this.steps.filter(step => step.status === status).length;
    return {done: count('done'), failed: count('failed'), skipped: count('skipped') + count('pending')};
  }

  async run(onChange: () => void) {
    for (const state of this.steps) {
      if (this.stopped) break;
      state.status = 'running';
      onChange();
      const controller = new AbortController();
      this.controller = controller;
      try {
        state.status = (await this.runStep(state.step, controller.signal)) ? 'done' : 'skipped';
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) {
          state.status = 'pending';
          break;
        }
        state.status = 'failed';
        state.error = (error as Error)?.message || this.plugin.t('aiTask.stepFailed');
      } finally {
        this.controller = null;
      }
      onChange();
    }
    onChange();
  }

  private language() {
    return resolveLanguageSetting(this.plugin.settings.assistantDefaults.language);
  }

  private async runStep(step: AssistantTaskStep, signal: AbortSignal) {
    const path = sanitizeTaskPath(step.path);
    if (!path) throw new Error(this.plugin.t('aiTask.invalidPath'));
    return step.action === 'create' ? this.createNote(step, path, signal) : this.modifyNote(step, path, signal);
  }

  private async modifyNote(step: AssistantTaskStep, path: string, signal: AbortSignal) {
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(this.plugin.t('aiTask.missingNote', {path}));
    if (this.plugin.isFileExcluded(file)) return false;
    const original = await this.plugin.app.vault.read(file);
    let next = step.content?.trim() ? step.content : '';
    if (!next) {
      const response = await this.plugin.api.rewriteText(
        {
          text: stripSourceMarkers(original),
          action: 'rewrite',
          language: this.language(),
          instruction: [this.instruction, step.title].filter(Boolean).join('\n'),
        },
        {signal},
      );
      next = extractRewriteText(response);
    }
    if (!next || signal.aborted) return false;
    this.snapshots.push({kind: 'modify', path, original});
    await this.plugin.app.vault.modify(file, next);
    return true;
  }

  private async createNote(step: AssistantTaskStep, path: string, signal: AbortSignal) {
    if (this.plugin.app.vault.getAbstractFileByPath(path)) throw new Error(this.plugin.t('aiTask.exists', {path}));
    let content = step.content?.trim() ? step.content : '';
    if (!content) {
      const response = await this.plugin.api.chat(
        {
          message: this.plugin.t('aiTask.createPrompt', {instruction: this.instruction, title: step.title || path}),
          language: this.language(),
        },
        {signal},
      );
      content = extractRewriteText(response);
    }
    if (!content || signal.aborted) return false;
    await this.ensureFolder(path);
    await this.plugin.app.vault.create(path, content);
    this.snapshots.push({kind: 'create', path});
    return true;
  }

  private async ensureFolder(path: string) {
    const folder = path.split('/').slice(0, -1).join('/');
    if (!folder || this.plugin.app.vault.getAbstractFileByPath(folder)) return;
    await this.plugin.app.vault.createFolder(folder);
  }

  /** Restores modified notes and trashes created ones, newest first. Returns how many steps were reverted. */
  async undo() {
    let restored = 0;
    const vault = this.plugin.app.vault;
    for (const snapshot of [...this.snapshots].reverse()) {
      const file = vault.getAbstractFileByPath(snapshot.path);
      if (!(file instanceof TFile)) continue;
      if (snapshot.kind === 'modify') await vault.modify(file, snapshot.original);
      else await this.plugin.app.fileManager.trashFile(file);
      restored += 1;
      const state = this.steps.find(item => sanitizeTaskPath(item.step.path) === snapshot.path && item.status === 'done');
      if (state) state.status = 'reverted';
    }
    this.snapshots = [];
    return restored;
  }
}
