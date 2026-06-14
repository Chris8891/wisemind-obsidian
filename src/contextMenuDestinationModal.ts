import {Modal, Notice, Setting} from 'obsidian';

import {
  defaultWiseMindDestinationLabels,
  loadWiseMindDestinationOptions,
  optionToDestination,
  targetLabel,
  type WiseMindDestination,
  type WiseMindDestinationOption,
  type WiseMindDestinationTarget,
} from './services/wisemindDestinations';
import {translate} from './i18n';
import type WiseMindObsidianPlugin from './main';

export class ContextMenuDestinationModal extends Modal {
  private options: WiseMindDestinationOption[] = [];
  private selectedValue = '';
  private resolved = false;

  constructor(
    private plugin: WiseMindObsidianPlugin,
    private target: WiseMindDestinationTarget,
    private defaultValue: string,
    private resolve: (destination: WiseMindDestination | null) => void,
  ) {
    super(plugin.app);
    this.selectedValue = defaultValue;
  }

  onOpen() {
    void this.render();
  }

  onClose() {
    this.contentEl.empty();
    if (!this.resolved) this.resolve(null);
  }

  private async render() {
    const {contentEl} = this;
    contentEl.empty();
    contentEl.addClass('wm-context-menu-destination-modal');
    const labels = this.destinationLabels();
    const targetName = targetLabel(this.target, labels);
    this.titleEl.setText(this.t('contextMenu.sendToTarget', {target: targetName}));
    contentEl.createEl('p', {
      text: this.target === 'knowledge'
        ? this.t('contextMenu.chooseKnowledgeDesc')
        : this.t('contextMenu.chooseFolderDesc'),
      cls: 'wm-context-menu-destination-desc',
    });

    this.options = await loadWiseMindDestinationOptions(this.plugin.api, this.target, labels);
    const enabledOptions = this.options.filter(option => !option.disabled);
    const preferred = enabledOptions.find(option => option.value === this.selectedValue) || enabledOptions[0];
    this.selectedValue = preferred?.value || '';

    new Setting(contentEl)
    .setName(this.target === 'knowledge'
      ? this.t('contextMenu.knowledgeSetting')
      : this.t('contextMenu.folderSetting', {target: targetName}))
      .addDropdown(dropdown => {
        this.options.forEach(option => dropdown.addOption(option.value, option.label));
        dropdown.setValue(this.selectedValue);
        dropdown.onChange(value => {
          this.selectedValue = value;
        });
        dropdown.selectEl.disabled = !enabledOptions.length;
      });

    if (!enabledOptions.length) {
      contentEl.createEl('p', {
        text: this.t('contextMenu.noKnowledgeDetailed'),
        cls: 'wm-context-menu-destination-desc',
      });
    }

    new Setting(contentEl)
      .addButton(button =>
        button
          .setButtonText(this.t('contextMenu.cancel'))
          .onClick(() => {
            this.finish(null);
          }),
      )
      .addButton(button =>
        button
          .setButtonText(this.t('contextMenu.send'))
          .setCta()
          .setDisabled(!enabledOptions.length)
          .onClick(() => {
            const option = this.options.find(item => item.value === this.selectedValue && !item.disabled);
            if (!option) {
              new Notice(this.t('contextMenu.chooseTargetFirst'));
              return;
            }
            this.finish(optionToDestination(this.target, option));
          }),
      );
  }

  private finish(destination: WiseMindDestination | null) {
    this.resolved = true;
    this.resolve(destination);
    this.close();
  }

  private t(key: string, params?: Record<string, unknown>) {
    return translate(this.plugin.settings.assistantDefaults.language, key, params);
  }

  private destinationLabels() {
    return {
      ...defaultWiseMindDestinationLabels,
      notes: this.t('destinationOptions.notes'),
      documents: this.t('destinationOptions.documents'),
      knowledge: this.t('destinationOptions.knowledge'),
      noKnowledge: this.t('destinationOptions.noKnowledge'),
      createKnowledgeFirst: this.t('destinationOptions.createKnowledgeFirst'),
      knowledgeMeta: this.t('destinationOptions.knowledgeMeta'),
      rootFolder: this.t('destinationOptions.rootFolder'),
      folder: this.t('destinationOptions.folder'),
    };
  }
}

export const openContextMenuDestinationModal = (
  plugin: WiseMindObsidianPlugin,
  target: WiseMindDestinationTarget,
  defaultValue: string,
) =>
  new Promise<WiseMindDestination | null>(resolve => {
    new ContextMenuDestinationModal(plugin, target, defaultValue, resolve).open();
  });
