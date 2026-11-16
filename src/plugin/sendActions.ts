import {Notice, type TAbstractFile, type TFile} from 'obsidian';

import {runObsidianToWiseMindImport} from '../importRunner';
import type WiseMindObsidianPlugin from '../main';
import {openSendModal} from '../modals/sendModal';
import {collectMarkdownFiles, collectMarkdownFilesFromTargets} from '../quickActions';
import type {WiseMindDestinationTarget} from '../services/wisemindDestinations';
import {isPathIgnored, readObsidianFile} from '../vaultScanner';

export class SendActions {
  constructor(private plugin: WiseMindObsidianPlugin) {}

  private get t() {
    return this.plugin.t.bind(this.plugin);
  }

  private isIgnored(path: string) {
    return isPathIgnored(path, this.plugin.settings.ignorePatterns);
  }

  async sendTargets(targets: TAbstractFile | TAbstractFile[]) {
    await this.sendFiles(collectMarkdownFilesFromTargets(this.plugin.app, targets) as TFile[]);
  }

  async sendActiveNote() {
    const file = this.plugin.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') {
      new Notice(this.t('obsidianMessages.noMarkdownNote'));
      return;
    }
    await this.sendFiles([file]);
  }

  async sendActiveFolder() {
    const folder = this.plugin.app.workspace.getActiveFile()?.parent;
    if (!folder) {
      new Notice(this.t('obsidianMessages.noSendableFolder'));
      return;
    }
    await this.sendFiles(collectMarkdownFiles(this.plugin.app, folder as never) as TFile[]);
  }

  /** Sending needs the desktop app; fail fast with a clear message instead of an empty destination list. */
  private async ensureConnected() {
    if (this.plugin.connected || (await this.plugin.testConnection())) return true;
    new Notice(this.t('common.disconnected'));
    return false;
  }

  async sendFiles(files: TFile[], initialTarget?: WiseMindDestinationTarget) {
    const allowed = files.filter(file => !this.isIgnored(file.path));
    if (!allowed.length) {
      new Notice(this.t(files.length ? 'sendModal.ignored' : 'obsidianMessages.noSendableNotes'));
      return;
    }
    if (!(await this.ensureConnected())) return;
    const choice = await openSendModal(
      this.plugin,
      this.t('sendModal.desc', {count: allowed.length}),
      initialTarget || 'documents',
    );
    if (!choice) return;

    const {target, destination, after} = choice;
    const settings = this.plugin.settings;
    this.setSyncing();
    const progress = new Notice(this.t('sendModal.sending', {count: allowed.length}), 0);
    try {
      const items = await Promise.all(allowed.map(file => readObsidianFile(this.plugin.app, file)));
      const result = await runObsidianToWiseMindImport({
        items,
        api: this.plugin.api,
        targets: {notes: target === 'notes', documents: target === 'documents', knowledge: target === 'knowledge'},
        noteFolderPaths: target === 'notes' && destination.value ? [destination.title] : undefined,
        documentFolderPaths: target === 'documents' && destination.value ? [destination.title] : undefined,
        knowledgeBaseNames: target === 'knowledge' && destination.title ? [destination.title] : undefined,
        duplicatePolicy: settings.duplicatePolicy,
        knowledgeBaseName: settings.contextMenuDefaults.knowledgeBaseName,
        chunkSize: settings.chunkSize,
        labels: this.plugin.importRunnerLabels(),
        onProgress: () => this.setSyncing(),
      });
      if (after.createRule) await this.createFolderRuleFromSend(allowed);
      const sent = result.created + result.updated + result.skipped;
      new Notice(
        result.failed
          ? this.t('sendModal.partialFailed', {count: sent, failed: result.failed})
          : this.t('obsidianMessages.sentNotes', {count: sent}),
      );
    } catch (error) {
      new Notice((error as Error)?.message || this.t('importRunner.failed'));
    } finally {
      progress.hide();
      if (!this.plugin.transcription?.isActive) this.plugin.statusBar?.setConnected();
    }
  }

  /** When the user opts in, turn a one-off folder send into a lasting sync rule. */
  private async createFolderRuleFromSend(files: TFile[]) {
    const parents = new Set(files.map(file => file.parent?.path || '').filter(path => path && path !== '/'));
    if (parents.size !== 1) return;
    const folder = [...parents][0];
    const exists = this.plugin.settings.syncRules.some(
      rule => rule.kind === 'folder' && rule.value === folder && rule.enabled,
    );
    if (exists) return;
    this.plugin.settings.syncRules = [
      ...this.plugin.settings.syncRules,
      {
        id: `rule-${Date.now().toString(36)}`,
        kind: 'folder',
        value: folder,
        includeSubfolders: true,
        keepFolderInSync: true,
        trigger: 'auto',
        knowledgeBaseIds: [],
        knowledgeBaseNames: [],
        enabled: true,
        createdAt: Date.now(),
      },
    ];
    await this.plugin.saveSettings();
    new Notice(this.t('sendModal.ruleCreated'));
    void this.plugin.syncEngine.scan();
  }

  /** A running transcription owns the status bar; its timer would otherwise be replaced. */
  private setSyncing() {
    if (!this.plugin.transcription?.isActive) this.plugin.statusBar?.setSyncing();
  }

  async sendSelection() {
    const text = this.plugin.getActiveEditorSelection();
    if (!text.trim()) {
      new Notice(this.t('obsidianMessages.noSelection'));
      return;
    }
    const sourcePath = this.plugin.app.workspace.getActiveFile()?.path || '';
    if (sourcePath && this.isIgnored(sourcePath)) {
      new Notice(this.t('sendModal.ignored'));
      return;
    }
    if (!(await this.ensureConnected())) return;
    try {
      await this.plugin.api.createNote({
        title: sourcePath.replace(/\.md$/i, '') || this.t('obsidianMessages.selectedTextTitle'),
        content: text,
        markdown: text,
        source: 'obsidian',
        sourcePath,
      });
      new Notice(this.t('obsidianMessages.selectedTextSent'));
    } catch (error) {
      new Notice((error as Error)?.message || this.t('importRunner.failed'));
    }
  }
}
