import { setIcon } from 'obsidian';

import { WISEMIND_ICON_ID } from './constants';
import { translate } from './i18n';
import type { SyncRunResult } from './types';
import type { WiseMindLanguageSetting } from './types';

type StatusState = 'connected' | 'disconnected' | 'syncing' | 'transcribing' | 'warning';

export class WiseMindStatusBar {
  private el: HTMLElement;
  private dotEl: HTMLElement;
  private textEl: HTMLElement;
  private state: StatusState = 'disconnected';
  private language: () => WiseMindLanguageSetting | undefined;
  private baseText = '';
  private dueCount = 0;
  private transcribing = false;
  private syncProgress: { done: number; total: number } | null = null;
  private syncSummary = { changed: 0, conflicts: 0 };

  constructor(
    el: HTMLElement,
    onClick: () => void,
    language: () => WiseMindLanguageSetting | undefined = () => undefined,
  ) {
    this.el = el;
    this.language = language;
    this.el.addClass('wisemind-panel-status');
    this.el.addClass('mod-clickable');
    this.el.onclick = onClick;
    setIcon(this.el.createSpan({ cls: 'wm2-status-icon' }), WISEMIND_ICON_ID);
    this.dotEl = this.el.createSpan({ cls: 'wm2-status-dot' });
    this.textEl = this.el.createSpan();
    this.setDisconnected();
  }

  private t(key: string, params?: Record<string, unknown>) {
    return translate(this.language(), key, params);
  }

  private render() {
    const parts = [this.baseText];
    let dot: string = this.state;
    if (!this.transcribing) {
      if (this.syncProgress) {
        parts.push(this.t('statusBarV2.syncProgress', this.syncProgress));
        dot = 'syncing';
      } else if (this.state === 'connected') {
        if (this.syncSummary.conflicts) {
          parts.push(this.t('statusBarV2.conflicts', { count: this.syncSummary.conflicts }));
          dot = 'warning';
        } else if (this.syncSummary.changed) {
          parts.push(this.t('statusBarV2.changed', { count: this.syncSummary.changed }));
        }
      }
      if (this.dueCount > 0) {
        parts.push(this.t('statusBarV2.due', { count: this.dueCount }));
        if (dot === 'connected') dot = 'due';
      }
    }
    this.dotEl.className = `wm2-status-dot is-${dot}`;
    this.textEl.setText(parts.join(' · '));
  }

  private setBase(text: string, state: StatusState) {
    this.baseText = text;
    this.state = state;
    this.transcribing = state === 'transcribing';
    this.render();
  }

  setDisconnected() {
    this.setBase(this.t('statusBar.disconnected'), 'disconnected');
  }

  setConnected() {
    this.setBase(this.t('statusBar.connected'), 'connected');
  }

  setSyncing() {
    this.setBase(this.t('statusBar.syncing'), 'syncing');
  }

  setDueCount(count: number) {
    this.dueCount = Math.max(0, count);
    this.render();
  }

  /** Shows "x / y" while an incremental sync runs; clears itself when done reaches total. */
  setSyncProgress(done: number, total: number) {
    this.syncProgress = total > 0 && done < total ? { done, total } : null;
    this.render();
  }

  setSyncSummary(changed: number, conflicts: number) {
    this.syncSummary = { changed: Math.max(0, changed), conflicts: Math.max(0, conflicts) };
    this.render();
  }

  setTranscribing(durationMs: number, paused = false) {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    this.setBase(this.t(paused ? 'statusBar.transcriptionPaused' : 'statusBar.transcribing', {
      duration: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    }), 'transcribing');
  }

  setResult(result: SyncRunResult) {
    this.setBase(this.t('statusBar.result', {
      count: result.created + result.updated + result.skipped,
      failed: result.failed,
    }), result.failed ? 'warning' : 'connected');
  }
}
