import { type App as VueApp,createApp } from 'vue';
import { ItemView, WorkspaceLeaf } from 'obsidian';

import PanelApp from '../components/PanelApp.vue';
import { WISEMIND_ICON_ID, WISEMIND_VIEW_TYPE } from '../constants';
import { i18n, setI18nLocale } from '../i18n';
import type WiseMindObsidianPlugin from '../main';

export class WiseMindObsidianView extends ItemView {
  private plugin: WiseMindObsidianPlugin;
  private vueApp: VueApp<Element> | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: WiseMindObsidianPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return WISEMIND_VIEW_TYPE;
  }

  getDisplayText() {
    return 'WiseMindAI';
  }

  getIcon() {
    return WISEMIND_ICON_ID;
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('wisemindai-obsidian-view');
    const root = this.contentEl.createDiv({
      cls: 'wisemindai-obsidian-root',
      attr: { id: 'wisemindai-obsidian-root' },
    });
    setI18nLocale(this.plugin.settings.assistantDefaults.language);
    this.vueApp = createApp(PanelApp, { plugin: this.plugin });
    this.vueApp.use(i18n);
    this.vueApp.mount(root);
  }

  async onClose() {
    this.vueApp?.unmount();
    this.vueApp = null;
    this.contentEl.empty();
  }
}
