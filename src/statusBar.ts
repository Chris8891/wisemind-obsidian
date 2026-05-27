import type { SyncRunResult } from './types';

export class WiseMindStatusBar {
  private el: HTMLElement;

  constructor(el: HTMLElement, onClick: () => void) {
    this.el = el;
    this.el.addClass('wisemind-panel-status');
    this.el.onclick = onClick;
    this.setDisconnected();
  }

  setDisconnected() {
    this.el.setText('WiseMindAI 未连接');
  }

  setConnected() {
    this.el.setText('WiseMindAI 已连接');
  }

  setSyncing() {
    this.el.setText('WiseMindAI 同步中...');
  }

  setResult(result: SyncRunResult) {
    this.el.setText(`已同步 ${result.created + result.updated + result.skipped} 项，失败 ${result.failed} 项`);
  }
}
