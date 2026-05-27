import { addIcon, Notice, Plugin, TAbstractFile } from 'obsidian';

import wiseMindLogoIcon from './assets/icons/wisemindai-logo.svg?raw';
import {
  type EditorRewriteAction,
  extractRewriteText,
  formatRewriteResult,
  rewriteActionCommandName,
  rewriteActionLabel,
} from './services/editorRewriteActions';
import type {WiseMindDestination, WiseMindDestinationTarget} from './services/wisemindDestinations';
import { WiseMindObsidianView } from './view/WiseMindObsidianView';
import { type AssistantActionKind, buildAssistantActionPlan } from './assistantActions';
import { WISEMIND_ICON_ID, WISEMIND_OBSIDIAN_ICON, WISEMIND_VIEW_TYPE } from './constants';
import {openContextMenuDestinationModal} from './contextMenuDestinationModal';
import {resolveLanguageSetting, setI18nLocale, translate} from './i18n';
import { runObsidianToWiseMindImport } from './importRunner';
import { collectMarkdownFiles, isMarkdownFile } from './quickActions';
import {
  DEFAULT_SETTINGS,
  normalizeWiseMindSettings,
  WiseMindSettingTab,
} from './settings';
import { WiseMindStatusBar } from './statusBar';
import type { ImportTargetSelection, WiseMindImportSettings } from './types';
import { readObsidianFile } from './vaultScanner';
import { WiseMindApiClient } from './wisemindApi';

import './styles.css';

type ContextMenuTarget = keyof ImportTargetSelection;

export default class WiseMindObsidianPlugin extends Plugin {
  settings: WiseMindImportSettings = DEFAULT_SETTINGS;
  api: WiseMindApiClient = new WiseMindApiClient(DEFAULT_SETTINGS.apiBaseUrl);
  statusBar!: WiseMindStatusBar;

  async onload() {
    this.settings = this.normalizeSettings((await this.loadData()) as Partial<WiseMindImportSettings> | null);
    setI18nLocale(this.settings.assistantDefaults.language);
    this.api = new WiseMindApiClient(this.settings.apiBaseUrl);

    addIcon(WISEMIND_ICON_ID, WISEMIND_OBSIDIAN_ICON);
    this.addSettingTab(new WiseMindSettingTab(this.app, this));
    this.registerView(WISEMIND_VIEW_TYPE, leaf => new WiseMindObsidianView(leaf, this));
    this.statusBar = new WiseMindStatusBar(this.addStatusBarItem(), () => void this.activateView());

    const ribbonIcon = this.addRibbonIcon(WISEMIND_ICON_ID, 'WiseMindAI', () => void this.activateView());
    if (!ribbonIcon.querySelector('svg')) {
      ribbonIcon.innerHTML = wiseMindLogoIcon;
    }

    this.registerCommands();
    this.registerMenus();
    void this.testConnection();
  }

  async onunload() {
    // Vue view teardown is handled by WiseMindObsidianView.onClose.
  }

  async saveSettings() {
    this.api = new WiseMindApiClient(this.settings.apiBaseUrl);
    setI18nLocale(this.settings.assistantDefaults.language);
    await this.saveData(this.settings);
  }

  async testConnection() {
    try {
      await this.api.health();
      this.statusBar?.setConnected();
      return true;
    } catch {
      this.statusBar?.setDisconnected();
      return false;
    }
  }

  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(WISEMIND_VIEW_TYPE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice(translate(this.settings.assistantDefaults.language, 'common.openPanelFailed'));
      return;
    }
    await leaf.setViewState({ type: WISEMIND_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  getActiveEditorSelection() {
    return (this.app.workspace as any).activeEditor?.editor?.getSelection?.() || '';
  }

  async runAssistantAction(kind: AssistantActionKind, selectedText = '') {
    try {
      const activeFile = this.app.workspace.getActiveFile();
      const currentNote = activeFile && (activeFile as any).extension === 'md'
        ? await readObsidianFile(this.app, activeFile as any)
        : null;
      const plan = buildAssistantActionPlan({ kind, currentNote, selectedText });
      await this.activateView();
      window.dispatchEvent(new CustomEvent('wisemindai:assistant-action', { detail: plan }));
    } catch (error: any) {
      new Notice(error?.message || '没有可处理的内容');
    }
  }

  private normalizeSettings(raw: Partial<WiseMindImportSettings> | null) {
    return normalizeWiseMindSettings(raw);
  }

  private registerCommands() {
    const rewriteActions: EditorRewriteAction[] = ['rewrite', 'expand', 'shorten', 'polish', 'tags'];
    this.addCommand({
      id: 'open-wisemindai',
      name: 'WiseMindAI: 打开面板',
      callback: () => void this.activateView(),
    });
    this.addCommand({
      id: 'send-current-note-to-wisemind',
      name: 'WiseMindAI: 发送当前笔记',
      callback: () => void this.sendActiveFileWithTarget('notes'),
    });
    this.addCommand({
      id: 'send-current-folder-to-wisemind',
      name: 'WiseMindAI: 发送当前文件夹',
      callback: () => void this.sendActiveFolder(),
    });
    this.addCommand({
      id: 'summarize-current-note',
      name: 'WiseMindAI: 总结当前笔记',
      callback: () => void this.runAssistantAction('summary'),
    });
    this.addCommand({
      id: 'summarize-selected-text',
      name: 'WiseMindAI: 总结选中文本',
      callback: () => void this.runAssistantAction('summary', this.getActiveEditorSelection()),
    });
    this.addCommand({
      id: 'generate-cards-current-note',
      name: 'WiseMindAI: 从当前笔记生成知识卡片',
      callback: () => void this.runAssistantAction('cards'),
    });
    this.addCommand({
      id: 'generate-cards-selected-text',
      name: 'WiseMindAI: 从选中文本生成知识卡片',
      callback: () => void this.runAssistantAction('cards', this.getActiveEditorSelection()),
    });
    this.addCommand({
      id: 'test-wisemind-connection',
      name: 'WiseMindAI: 测试连接',
      callback: async () => {
        const ok = await this.testConnection();
        new Notice(ok
          ? translate(this.settings.assistantDefaults.language, 'common.connected')
          : translate(this.settings.assistantDefaults.language, 'common.disconnected'));
      },
    });
    rewriteActions.forEach(action => {
      this.addCommand({
        id: `rewrite-selected-text-${action}`,
        name: rewriteActionCommandName(action),
        callback: () => void this.runEditorRewriteAction(action),
      });
    });
  }

  private registerMenus() {
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (isMarkdownFile(file)) {
          this.addFileMenuItems(menu, [file as any]);
          return;
        }
        const files = collectMarkdownFiles(this.app, file as TAbstractFile);
        if (files.length) this.addFileMenuItems(menu, files, true);
      }),
    );

    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor, view) => {
        if (view.file) this.addFileMenuItems(menu, [view.file]);
        const selectedText = editor.getSelection();
        if (selectedText.trim()) {
          menu.addItem(item =>
            item
              .setTitle('发送选中文本到 WiseMindAI 笔记')
              .setIcon(WISEMIND_ICON_ID)
              .onClick(() => void this.sendSelectedTextWithTarget(selectedText, view.file?.path || '当前笔记')),
          );
          menu.addItem(item =>
            item
              .setTitle('用 WiseMindAI 总结选中文本')
              .setIcon(WISEMIND_ICON_ID)
              .onClick(() => void this.runAssistantAction('summary', selectedText)),
          );
          menu.addItem(item =>
            item
              .setTitle('用 WiseMindAI 生成知识卡片')
              .setIcon(WISEMIND_ICON_ID)
              .onClick(() => void this.runAssistantAction('cards', selectedText)),
          );
          (['rewrite', 'expand', 'shorten', 'polish', 'tags'] as EditorRewriteAction[]).forEach(
            action => {
              menu.addItem(item =>
                item
                  .setTitle(`WiseMindAI ${rewriteActionLabel(action)}`)
                  .setIcon(WISEMIND_ICON_ID)
                  .onClick(() => void this.runEditorRewriteAction(action, selectedText)),
              );
            },
          );
        }
      }),
    );
  }

  private async runEditorRewriteAction(action: EditorRewriteAction, selectedText = '') {
    const editor = (this.app.workspace as any).activeEditor?.editor;
    const text = selectedText || editor?.getSelection?.() || '';
    if (!editor || !text.trim()) {
      new Notice('当前编辑器没有选中文本');
      return;
    }

    try {
      const response = await this.api.rewriteText({
        text,
        action,
        language: resolveLanguageSetting(this.settings.assistantDefaults.language),
      });
      const rewritten = extractRewriteText(response);
      if (!rewritten) {
        new Notice('WiseMindAI 没有返回可插入的内容');
        return;
      }
      editor.replaceSelection(formatRewriteResult(action, text, rewritten));
      new Notice(`WiseMindAI ${rewriteActionLabel(action)}已插入`);
    } catch (error: any) {
      new Notice(error?.message || `WiseMindAI ${rewriteActionLabel(action)}失败`);
    }
  }

  private addFileMenuItems(menu: any, files: any[], folder = false) {
    const prefix = folder ? '发送整个文件夹到' : '发送到';
    [
      ['notes', 'WiseMindAI 笔记'],
      ['documents', 'WiseMindAI 文档'],
      ['knowledge', 'WiseMindAI 知识库'],
    ].forEach(([target, label]) => {
      menu.addItem((item: any) =>
        item
          .setTitle(`${prefix}${label}`)
          .setIcon(WISEMIND_ICON_ID)
          .onClick(() => void this.sendFilesWithTarget(files, target as ContextMenuTarget)),
      );
    });
  }

  private async sendActiveFileWithTarget(target: ContextMenuTarget) {
    const file = this.app.workspace.getActiveFile();
    if (!file || (file as any).extension !== 'md') {
      new Notice('当前没有打开的 Markdown 笔记');
      return;
    }
    await this.sendFilesWithTarget([file as any], target);
  }

  private async sendActiveFolder() {
    const file = this.app.workspace.getActiveFile();
    if (!file?.parent) {
      new Notice('当前没有可发送的文件夹');
      return;
    }
    const files = collectMarkdownFiles(this.app, file.parent as any);
    await this.sendFilesWithTarget(files, 'notes');
  }

  private async sendFilesWithTarget(files: any[], target: ContextMenuTarget) {
    if (!files.length) {
      new Notice('没有可发送的 Markdown 笔记');
      return;
    }
    const destination = await this.resolveContextMenuDestination(target);
    if (!destination) return;
    const items = await Promise.all(files.map(file => readObsidianFile(this.app, file)));
    const targets = {
      notes: target === 'notes',
      documents: target === 'documents',
      knowledge: target === 'knowledge',
    };
    const result = await runObsidianToWiseMindImport({
      items,
      api: this.api,
      targets,
      noteFolderPaths: target === 'notes' && destination.value ? [destination.title] : undefined,
      documentFolderPaths: target === 'documents' && destination.value ? [destination.title] : undefined,
      knowledgeBaseNames: target === 'knowledge' && destination.title ? [destination.title] : undefined,
      duplicatePolicy: this.settings.duplicatePolicy,
      knowledgeBaseName: this.settings.contextMenuDefaults.knowledgeBaseName,
      chunkSize: this.settings.chunkSize,
      onProgress: () => this.statusBar?.setSyncing(),
    });
    this.statusBar?.setConnected();
    new Notice(`已发送 ${result.created + result.updated + result.skipped} 篇笔记到 WiseMindAI`);
  }

  private async sendSelectedTextWithTarget(text: string, sourcePath: string) {
    const title = sourcePath.replace(/\.md$/i, '') || 'Obsidian 选中文本';
    await this.api.createNote({
      title,
      content: text,
      markdown: text,
      source: 'obsidian',
      sourcePath,
    });
    new Notice('选中文本已发送到 WiseMindAI 笔记');
  }

  private async resolveContextMenuDestination(target: ContextMenuTarget): Promise<WiseMindDestination | null> {
    const defaults = this.settings.contextMenuDefaults;
    const defaultValue =
      target === 'notes'
        ? defaults.noteFolderPath
        : target === 'documents'
          ? defaults.documentFolderPath
          : defaults.knowledgeBaseName;
    return openContextMenuDestinationModal(this, target as WiseMindDestinationTarget, defaultValue);
  }
}
