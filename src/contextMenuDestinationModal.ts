import {Modal, Notice, Setting} from 'obsidian';

import {
  loadWiseMindDestinationOptions,
  optionToDestination,
  targetLabel,
  type WiseMindDestination,
  type WiseMindDestinationOption,
  type WiseMindDestinationTarget,
} from './services/wisemindDestinations';
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
    this.titleEl.setText(`发送到 ${targetLabel(this.target)}`);
    contentEl.createEl('p', {
      text: this.target === 'knowledge' ? '选择要发送到的知识库。' : '选择要发送到的文件夹。',
      cls: 'wm-context-menu-destination-desc',
    });

    this.options = await loadWiseMindDestinationOptions(this.plugin.api, this.target);
    const enabledOptions = this.options.filter(option => !option.disabled);
    const preferred = enabledOptions.find(option => option.value === this.selectedValue) || enabledOptions[0];
    this.selectedValue = preferred?.value || '';

    new Setting(contentEl)
    .setName(this.target === 'knowledge' ? 'WiseMindAI 知识库' :`${targetLabel(this.target)}文件夹`)
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
        text: '没有知识库，请先在 WiseMindAI 中创建知识库后再发送。',
        cls: 'wm-context-menu-destination-desc',
      });
    }

    new Setting(contentEl)
      .addButton(button =>
        button
          .setButtonText('取消')
          .onClick(() => {
            this.finish(null);
          }),
      )
      .addButton(button =>
        button
          .setButtonText('发送')
          .setCta()
          .setDisabled(!enabledOptions.length)
          .onClick(() => {
            const option = this.options.find(item => item.value === this.selectedValue && !item.disabled);
            if (!option) {
              new Notice('请先选择目标');
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
}

export const openContextMenuDestinationModal = (
  plugin: WiseMindObsidianPlugin,
  target: WiseMindDestinationTarget,
  defaultValue: string,
) =>
  new Promise<WiseMindDestination | null>(resolve => {
    new ContextMenuDestinationModal(plugin, target, defaultValue, resolve).open();
  });
