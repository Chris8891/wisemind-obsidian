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

export const collectMarkdownFiles = (app: App, target: TAbstractFile): TFile[] => {
  if (isMarkdownFile(target)) return [target];
  const folderPath = target.path.endsWith('/') ? target.path : `${target.path}/`;
  return app.vault.getMarkdownFiles().filter(file => file.path.startsWith(folderPath));
};

export const isMarkdownFile = (file: TAbstractFile): file is TFile =>
  'extension' in file && (file as TFile).extension === 'md';

const targetsForAction = (action: QuickAction): ImportTargetSelection => {
  if (action === 'send-file-to-document') return { notes: false, documents: true, knowledge: false };
  if (action === 'send-file-to-knowledge') return { notes: false, documents: false, knowledge: true };
  return { notes: true, documents: false, knowledge: false };
};
