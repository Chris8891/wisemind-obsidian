import { addIcon, Notice, Plugin, TAbstractFile } from 'obsidian';

import wiseMindLogoIcon from './assets/icons/wisemindai-logo.svg?raw';
import {
  type EditorRewriteAction,
  type EditorRewriteLabels,
  extractRewriteText,
  formatRewriteResult,
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

import './styles.scss';

type ContextMenuTarget = keyof ImportTargetSelection;

export default class WiseMindObsidianPlugin extends Plugin {
  settings: WiseMindImportSettings = DEFAULT_SETTINGS;
  api: WiseMindApiClient = new WiseMindApiClient(DEFAULT_SETTINGS.apiBaseUrl);
  statusBar!: WiseMindStatusBar;

  async onload() {
    this.settings = this.normalizeSettings((await this.loadData()) as Partial<WiseMindImportSettings> | null);
    setI18nLocale(this.settings.assistantDefaults.language);
    this.api = new WiseMindApiClient(
      this.settings.apiBaseUrl,
      fetch.bind(globalThis),
      10000,
      () => this.settings.assistantDefaults.language,
    );

    addIcon(WISEMIND_ICON_ID, WISEMIND_OBSIDIAN_ICON);
    this.addSettingTab(new WiseMindSettingTab(this.app, this));
    this.registerView(WISEMIND_VIEW_TYPE, leaf => new WiseMindObsidianView(leaf, this));
    this.statusBar = new WiseMindStatusBar(
      this.addStatusBarItem(),
      () => void this.activateView(),
      () => this.settings.assistantDefaults.language,
    );

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
    this.api = new WiseMindApiClient(
      this.settings.apiBaseUrl,
      fetch.bind(globalThis),
      10000,
      () => this.settings.assistantDefaults.language,
    );
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
      new Notice(error?.message || this.t('obsidianMessages.noProcessableContent'));
    }
  }

  private t(key: string, params?: Record<string, unknown>) {
    return translate(this.settings.assistantDefaults.language, key, params);
  }

  private rewriteLabels(): EditorRewriteLabels {
    return {
      rewrite: this.t('editorRewrite.rewrite'),
      expand: this.t('editorRewrite.expand'),
      shorten: this.t('editorRewrite.shorten'),
      polish: this.t('editorRewrite.polish'),
      tags: this.t('editorRewrite.tags'),
    };
  }

  private importRunnerLabels() {
    return {
      defaultKnowledgeBase: this.t('importRunner.defaultKnowledgeBase'),
      note: this.t('importRunner.note'),
      document: this.t('importRunner.document'),
      knowledge: this.t('importRunner.knowledge'),
      rootFolder: this.t('importRunner.rootFolder'),
      noteUpdated: (target: string) => this.t('importRunner.noteUpdated', {target}),
      noteCreated: (target: string) => this.t('importRunner.noteCreated', {target}),
      documentUpdated: (target: string) => this.t('importRunner.documentUpdated', {target}),
      documentCreated: (target: string) => this.t('importRunner.documentCreated', {target}),
      knowledgeDesc: this.t('importRunner.knowledgeDesc'),
      knowledgeUpdated: (target: string) => this.t('importRunner.knowledgeUpdated', {target}),
      knowledgeCreated: (target: string) => this.t('importRunner.knowledgeCreated', {target}),
      failed: this.t('importRunner.failed'),
      failedTarget: this.t('importRunner.failedTarget'),
    };
  }

  private normalizeSettings(raw: Partial<WiseMindImportSettings> | null) {
    return normalizeWiseMindSettings(raw);
  }

  private registerCommands() {
    const rewriteActions: EditorRewriteAction[] = ['rewrite', 'expand', 'shorten', 'polish', 'tags'];
    this.addCommand({
      id: 'open-wisemindai',
      name: this.t('commands.openPanel'),
      callback: () => void this.activateView(),
    });
    this.addCommand({
      id: 'send-current-note-to-wisemind',
      name: this.t('commands.sendCurrentNote'),
      callback: () => void this.sendActiveFileWithTarget('notes'),
    });
    this.addCommand({
      id: 'send-current-folder-to-wisemind',
      name: this.t('commands.sendCurrentFolder'),
      callback: () => void this.sendActiveFolder(),
    });
    this.addCommand({
      id: 'summarize-current-note',
      name: this.t('commands.summarizeCurrentNote'),
      callback: () => void this.runAssistantAction('summary'),
    });
    this.addCommand({
      id: 'summarize-selected-text',
      name: this.t('commands.summarizeSelectedText'),
      callback: () => void this.runAssistantAction('summary', this.getActiveEditorSelection()),
    });
    this.addCommand({
      id: 'generate-cards-current-note',
      name: this.t('commands.cardsCurrentNote'),
      callback: () => void this.runAssistantAction('cards'),
    });
    this.addCommand({
      id: 'generate-cards-selected-text',
      name: this.t('commands.cardsSelectedText'),
      callback: () => void this.runAssistantAction('cards', this.getActiveEditorSelection()),
    });
    this.addCommand({
      id: 'test-wisemind-connection',
      name: this.t('commands.testConnection'),
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
        name: this.t('commands.rewriteSelected', {action: rewriteActionLabel(action, this.rewriteLabels())}),
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
              .setTitle(this.t('contextMenu.sendSelectedToNotes'))
              .setIcon(WISEMIND_ICON_ID)
              .onClick(() => void this.sendSelectedTextWithTarget(selectedText, view.file?.path || this.t('contextMenu.currentNote'))),
          );
          menu.addItem(item =>
            item
              .setTitle(this.t('contextMenu.summarizeSelected'))
              .setIcon(WISEMIND_ICON_ID)
              .onClick(() => void this.runAssistantAction('summary', selectedText)),
          );
          menu.addItem(item =>
            item
              .setTitle(this.t('contextMenu.cardsSelected'))
              .setIcon(WISEMIND_ICON_ID)
              .onClick(() => void this.runAssistantAction('cards', selectedText)),
          );
          (['rewrite', 'expand', 'shorten', 'polish', 'tags'] as EditorRewriteAction[]).forEach(
            action => {
              menu.addItem(item =>
                item
                  .setTitle(`WiseMindAI ${rewriteActionLabel(action, this.rewriteLabels())}`)
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
      new Notice(this.t('obsidianMessages.noSelection'));
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
        new Notice(this.t('obsidianMessages.noInsertContent'));
        return;
      }
      const actionLabel = rewriteActionLabel(action, this.rewriteLabels());
      editor.replaceSelection(formatRewriteResult(action, text, rewritten, this.rewriteLabels()));
      new Notice(this.t('obsidianMessages.rewriteInserted', {action: actionLabel}));
    } catch (error: any) {
      new Notice(error?.message || this.t('obsidianMessages.rewriteFailed', {
        action: rewriteActionLabel(action, this.rewriteLabels()),
      }));
    }
  }

  private addFileMenuItems(menu: any, files: any[], folder = false) {
    const prefix = folder ? this.t('contextMenu.sendFolderPrefix') : this.t('contextMenu.sendPrefix');
    [
      ['notes', this.t('contextMenu.notesTarget')],
      ['documents', this.t('contextMenu.documentsTarget')],
      ['knowledge', this.t('contextMenu.knowledgeTarget')],
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
      new Notice(this.t('obsidianMessages.noMarkdownNote'));
      return;
    }
    await this.sendFilesWithTarget([file as any], target);
  }

  private async sendActiveFolder() {
    const file = this.app.workspace.getActiveFile();
    if (!file?.parent) {
      new Notice(this.t('obsidianMessages.noSendableFolder'));
      return;
    }
    const files = collectMarkdownFiles(this.app, file.parent as any);
    await this.sendFilesWithTarget(files, 'notes');
  }

  private async sendFilesWithTarget(files: any[], target: ContextMenuTarget) {
    if (!files.length) {
      new Notice(this.t('obsidianMessages.noSendableNotes'));
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
      labels: this.importRunnerLabels(),
      onProgress: () => this.statusBar?.setSyncing(),
    });
    this.statusBar?.setConnected();
    new Notice(this.t('obsidianMessages.sentNotes', {
      count: result.created + result.updated + result.skipped,
    }));
  }

  private async sendSelectedTextWithTarget(text: string, sourcePath: string) {
    const title = sourcePath.replace(/\.md$/i, '') || this.t('obsidianMessages.selectedTextTitle');
    await this.api.createNote({
      title,
      content: text,
      markdown: text,
      source: 'obsidian',
      sourcePath,
    });
    new Notice(this.t('obsidianMessages.selectedTextSent'));
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
