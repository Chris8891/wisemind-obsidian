import { translate } from './i18n';
import type { SyncRunResult } from './types';
import type { WiseMindLanguageSetting } from './types';

export class WiseMindStatusBar {
  private el: HTMLElement;
  private language: () => WiseMindLanguageSetting | undefined;

  constructor(
    el: HTMLElement,
    onClick: () => void,
    language: () => WiseMindLanguageSetting | undefined = () => undefined,
  ) {
    this.el = el;
    this.language = language;
    this.el.addClass('wisemind-panel-status');
    this.el.onclick = onClick;
    this.setDisconnected();
  }

  private t(key: string, params?: Record<string, unknown>) {
    return translate(this.language(), key, params);
  }

  setDisconnected() {
    this.el.setText(this.t('statusBar.disconnected'));
  }

  setConnected() {
    this.el.setText(this.t('statusBar.connected'));
  }

  setSyncing() {
    this.el.setText(this.t('statusBar.syncing'));
  }

  setTranscribing(durationMs: number, paused = false) {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    this.el.setText(this.t(paused ? 'statusBar.transcriptionPaused' : 'statusBar.transcribing', {
      duration: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    }));
  }

  setResult(result: SyncRunResult) {
    this.el.setText(this.t('statusBar.result', {
      count: result.created + result.updated + result.skipped,
      failed: result.failed,
    }));
  }
}
