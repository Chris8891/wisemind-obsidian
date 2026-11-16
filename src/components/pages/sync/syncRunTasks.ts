import {Notice} from 'obsidian';

import {runObsidianToWiseMindImport} from '../../../importRunner';
import type WiseMindObsidianPlugin from '../../../main';
import type {ObsidianSourceItem, SyncRunResult, WiseMindSourceItem} from '../../../types';
import {runWiseMindToObsidianImport} from '../../../wisemindToObsidianRunner';

import type {Translate} from './syncGrouping';
import type {DestinationItem, Direction} from './types';

type ReportProgress = (completed: number, total: number) => void;

const importRunnerLabels = (t: Translate) => ({
  defaultKnowledgeBase: t('importRunner.defaultKnowledgeBase'),
  note: t('importRunner.note'),
  document: t('importRunner.document'),
  knowledge: t('importRunner.knowledge'),
  rootFolder: t('importRunner.rootFolder'),
  noteUpdated: (target: string) => t('importRunner.noteUpdated', {target}),
  noteCreated: (target: string) => t('importRunner.noteCreated', {target}),
  documentUpdated: (target: string) => t('importRunner.documentUpdated', {target}),
  documentCreated: (target: string) => t('importRunner.documentCreated', {target}),
  knowledgeDesc: t('importRunner.knowledgeDesc'),
  knowledgeUpdated: (target: string) => t('importRunner.knowledgeUpdated', {target}),
  knowledgeCreated: (target: string) => t('importRunner.knowledgeCreated', {target}),
  knowledgeSkipped: (target: string) => t('importRunner.knowledgeSkipped', {target}),
  failed: t('importRunner.failed'),
  failedTarget: t('importRunner.failedTarget'),
});

const obsidianWriterLabels = (t: Translate) => ({
  unnamedKnowledge: t('obsidianWriter.unnamedKnowledge'),
  skippedSameSource: t('obsidianWriter.skippedSameSource'),
  syncFailed: t('obsidianWriter.syncFailed'),
  failedTarget: t('obsidianWriter.failedTarget'),
});

/** Returns null (after a Notice) when nothing is selected, otherwise the import result. */
export const runToWiseMind = async (
  plugin: WiseMindObsidianPlugin,
  t: Translate,
  items: ObsidianSourceItem[],
  destinations: DestinationItem[],
  report: ReportProgress,
): Promise<SyncRunResult | null> => {
  if (!items.length) {
    new Notice(t('syncPage.chooseObsidianFirst'));
    return null;
  }
  if (!destinations.length) {
    new Notice(t('syncPage.chooseWiseMindTargetFirst'));
    return null;
  }
  const total = items.length * Math.max(destinations.length, 1);
  report(0, total);
  const valuesFor = (target: DestinationItem['target']) =>
    destinations.filter(item => item.target === target).map(item => item.value);
  return runObsidianToWiseMindImport({
    items,
    app: plugin.app,
    api: plugin.api,
    targets: {
      notes: destinations.some(item => item.target === 'notes'),
      documents: destinations.some(item => item.target === 'documents'),
      knowledge: destinations.some(item => item.target === 'knowledge'),
    },
    noteFolderPaths: valuesFor('notes'),
    documentFolderPaths: valuesFor('documents'),
    knowledgeBaseNames: valuesFor('knowledge'),
    duplicatePolicy: plugin.settings.duplicatePolicy,
    knowledgeBaseName: plugin.settings.contextMenuDefaults.knowledgeBaseName,
    chunkSize: plugin.settings.chunkSize,
    labels: importRunnerLabels(t),
    onProgress: progress => report(progress.items.length, total),
  });
};

/** Returns null (after a Notice) when nothing is selected, otherwise the write result. */
export const runToObsidian = async (
  plugin: WiseMindObsidianPlugin,
  t: Translate,
  items: WiseMindSourceItem[],
  folders: string[],
  includeFolderStructure: boolean,
  report: ReportProgress,
): Promise<SyncRunResult | null> => {
  if (!items.length) {
    new Notice(t('syncPage.chooseWiseMindContentFirst'));
    return null;
  }
  if (!folders.length) {
    new Notice(t('syncPage.chooseObsidianFolderFirst'));
    return null;
  }
  const total = items.length * Math.max(folders.length, 1);
  report(0, total);
  return runWiseMindToObsidianImport({
    app: plugin.app,
    items,
    rootFolder: plugin.settings.defaultObsidianRootFolder,
    rootFolders: folders,
    includeFolderStructure,
    duplicatePolicy: plugin.settings.duplicatePolicy,
    chunkSize: plugin.settings.chunkSize,
    labels: obsidianWriterLabels(t),
    onProgress: progress => report(progress.items.length, total),
  });
};

export const recordSyncHistory = (
  plugin: WiseMindObsidianPlugin,
  t: Translate,
  result: SyncRunResult,
  run: {direction: Direction; scopeText: string; targetFolders: string[]},
) => {
  const toWiseMind = run.direction === 'to-wisemind';
  plugin.settings.syncHistory.unshift({
    id: `sync-${Date.now()}`,
    createdAt: Date.now(),
    direction: run.direction,
    sourceLabel: toWiseMind ? t('syncPage.obsidianVault') : t('syncPage.wiseMindLocalData'),
    targetLabel: toWiseMind ? run.scopeText : t('syncPage.obsidianVault'),
    sourceFolders: [],
    targetFolders: run.direction === 'to-obsidian' ? run.targetFolders : [],
    itemTitles: result.items.map(item => item.title),
    syncItems: result.items.map(item => ({
      title: item.title,
      target: item.target || (toWiseMind ? run.scopeText : 'Obsidian'),
      status: item.status,
    })),
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    failed: result.failed,
  });
  plugin.settings.syncHistory = plugin.settings.syncHistory.slice(0, 50);
};
