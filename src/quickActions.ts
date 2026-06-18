import type { App, TAbstractFile, TFile } from 'obsidian';

import type { ImportTargetSelection } from './types';

export type QuickAction =
  | 'send-current-note'
  | 'send-current-folder'
  | 'send-selected-text'
  | 'send-file-to-note'
  | 'send-file-to-document'
  | 'send-file-to-knowledge';

export type QuickActionPlan = {
  action: QuickAction;
  scope: 'file' | 'folder' | 'selection';
  paths: string[];
  selectedText?: string;
  targetDefaults: ImportTargetSelection;
};

export const buildQuickActionPlan = (params: {
  action: QuickAction;
  file?: Pick<TFile, 'path' | 'basename'> | null;
  folderFiles?: Array<Pick<TFile, 'path'>>;
  selectedText?: string;
}): QuickActionPlan => {
  const targetDefaults = targetsForAction(params.action);
  if (params.action === 'send-selected-text') {
    return {
      action: params.action,
      scope: 'selection',
      paths: params.file ? [params.file.path] : [],
      selectedText: params.selectedText || '',
      targetDefaults,
    };
  }

  if (params.action === 'send-current-folder') {
    return {
      action: params.action,
      scope: 'folder',
      paths: (params.folderFiles || []).map(file => file.path),
      targetDefaults,
    };
  }

  return {
    action: params.action,
    scope: 'file',
    paths: params.file ? [params.file.path] : [],
    targetDefaults,
  };
};

export const collectMarkdownFiles = (app: App, target: TAbstractFile | null | undefined): TFile[] => {
  if (!target?.path) return [];
  if (isMarkdownFile(target)) {
    const vaultFile = app.vault.getAbstractFileByPath(target.path);
    return isMarkdownFile(vaultFile) ? [vaultFile] : [target as TFile];
  }
  const folderPrefix = normalizeFolderPrefix(target.path);
  return app.vault.getMarkdownFiles().filter(file => {
    const filePath = normalizeVaultPath(file.path);
    return folderPrefix ? filePath.startsWith(folderPrefix) : true;
  });
};

export const collectMarkdownFilesFromTargets = (
  app: App,
  targets: TAbstractFile | TAbstractFile[] | null | undefined,
): TFile[] => {
  const files = (Array.isArray(targets) ? targets : [targets]).flatMap(target =>
    collectMarkdownFiles(app, target),
  );
  const seen = new Set<string>();
  return files.filter(file => {
    if (seen.has(file.path)) return false;
    seen.add(file.path);
    return true;
  });
};

export const isMarkdownFile = (file: TAbstractFile | null | undefined): file is TFile => {
  if (!file?.path) return false;
  return ((file as TFile).extension || '').toLowerCase() === 'md' || file.path.toLowerCase().endsWith('.md');
};

export const hasFolderTarget = (targets: TAbstractFile | TAbstractFile[] | null | undefined): boolean =>
  (Array.isArray(targets) ? targets : [targets]).some(target => Boolean(target?.path) && !isMarkdownFile(target));

const normalizeVaultPath = (path: string) => path.replace(/^\/+/, '').replace(/\/+$/g, '');

const normalizeFolderPrefix = (path: string) => {
  const normalized = normalizeVaultPath(path);
  return normalized ? `${normalized}/` : '';
};

const targetsForAction = (action: QuickAction): ImportTargetSelection => {
  if (action === 'send-file-to-document') return { notes: false, documents: true, knowledge: false };
  if (action === 'send-file-to-knowledge') return { notes: false, documents: false, knowledge: true };
  return { notes: true, documents: false, knowledge: false };
};
