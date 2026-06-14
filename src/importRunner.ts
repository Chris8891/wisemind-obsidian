import type { App } from 'obsidian';

import { writeConvertedMarkdownCache } from './markdownImages';
import { appendMarker, createObsidianSourceMarker } from './markers';
import type { DuplicatePolicy, ImportTargetSelection,ObsidianSourceItem,SyncRunResult } from './types';
import type { WiseMindApiClient } from './wisemindApi';

export type ObsidianToWiseMindOptions = {
  items: ObsidianSourceItem[];
  app?: App;
  api: WiseMindApiClient;
  targets: ImportTargetSelection;
  noteFolderPaths?: string[];
  documentFolderPaths?: string[];
  knowledgeBaseNames?: string[];
  duplicatePolicy: DuplicatePolicy;
  knowledgeBaseName: string;
  chunkSize: number;
  signal?: AbortSignal;
  onProgress?: (result: SyncRunResult) => void;
  labels?: ObsidianToWiseMindImportLabels;
};

export type ObsidianToWiseMindImportLabels = {
  defaultKnowledgeBase: string;
  note: string;
  document: string;
  knowledge: string;
  rootFolder: string;
  noteUpdated: (target: string) => string;
  noteCreated: (target: string) => string;
  documentUpdated: (target: string) => string;
  documentCreated: (target: string) => string;
  knowledgeDesc: string;
  knowledgeUpdated: (target: string) => string;
  knowledgeCreated: (target: string) => string;
  failed: string;
  failedTarget: string;
};

const defaultLabels: ObsidianToWiseMindImportLabels = {
  defaultKnowledgeBase: 'Obsidian import',
  note: 'Note',
  document: 'Document',
  knowledge: 'Knowledge base',
  rootFolder: 'Root',
  noteUpdated: target => `Updated WiseMindAI note${target}`,
  noteCreated: target => `Imported as WiseMindAI note${target}`,
  documentUpdated: target => `Updated WiseMindAI document${target}`,
  documentCreated: target => `Imported as WiseMindAI document${target}`,
  knowledgeDesc: 'Imported from Obsidian',
  knowledgeUpdated: target => `Updated WiseMindAI knowledge base: ${target}`,
  knowledgeCreated: target => `Imported into WiseMindAI knowledge base: ${target}`,
  failed: 'Import failed',
  failedTarget: 'Failed',
};

export const runObsidianToWiseMindImport = async (options: ObsidianToWiseMindOptions): Promise<SyncRunResult> => {
  const result = emptyResult();
  const labels = options.labels || defaultLabels;
  const folderCache = new Map<string, string | number | null>();
  const knowledgeBaseCache = new Map<string, number | string | null>();
  const noteFolderRoots = options.noteFolderPaths?.length ? options.noteFolderPaths : [''];
  const documentFolderRoots = options.documentFolderPaths?.length ? options.documentFolderPaths : [''];
  const knowledgeBaseNames = options.knowledgeBaseNames?.length
    ? options.knowledgeBaseNames
    : [options.knowledgeBaseName || labels.defaultKnowledgeBase];

  for (let index = 0; index < options.items.length; index += options.chunkSize || 10) {
    if (options.signal?.aborted) break;
    const chunk = options.items.slice(index, index + (options.chunkSize || 10));
    for (const item of chunk) {
      if (options.signal?.aborted) break;
      const marker = createObsidianSourceMarker(item);
      const markdown = appendMarker(item.markdown, marker);
      const sourcePath = item.absolutePath || item.path;
      let convertedMarkdownFilePath: string | null = null;
      const getConvertedMarkdownFilePath = async () => {
        if (convertedMarkdownFilePath !== null) return convertedMarkdownFilePath;
        convertedMarkdownFilePath = options.app
          ? await writeConvertedMarkdownCache(options.app, item.path, item.title, markdown).catch(() => sourcePath)
          : sourcePath;
        return convertedMarkdownFilePath;
      };
      try {
        if (options.targets.notes) {
          for (const rootPath of noteFolderRoots) {
            const folderId = await resolvePathFolder(
              rootPath,
              folderCache,
              options.api.resolveNoteFolder.bind(options.api),
            );
            const payload = {
              title: item.title,
              md: markdown,
              text: item.plainText,
              content: '',
              tags: item.tags,
              from_folder: normalizeRemoteId(folderId),
            };
            const existing = options.duplicatePolicy === 'update'
              ? await findExistingNote(options.api, item.title, normalizeRemoteId(folderId))
              : null;
            if (existing) {
              await options.api.updateNote(existing.id, payload);
              push(result, item.title, item.path, 'updated', labels.noteUpdated(formatOptionalTarget(rootPath)), wiseMindTargetLabel(labels.note, rootPath, labels));
            } else {
              await options.api.createNote(payload);
              push(result, item.title, item.path, 'created', labels.noteCreated(formatOptionalTarget(rootPath)), wiseMindTargetLabel(labels.note, rootPath, labels));
            }
          }
        }

        if (options.targets.documents) {
          for (const rootPath of documentFolderRoots) {
            const folderId = await resolvePathFolder(
              rootPath,
              folderCache,
              options.api.resolveFileFolder.bind(options.api),
            );
            const folder = normalizeRemoteId(folderId);
            const markdownFilePath = await getConvertedMarkdownFilePath();
            const payload = {
              name: item.title,
              type: 'md',
              fileType: 'md',
              filePath: markdownFilePath,
              content: markdown,
              note: `Imported from Obsidian: ${item.path}`,
              tags: item.tags,
              from_folder: folder,
            };
            const existing = options.duplicatePolicy === 'update'
              ? await findExistingDocument(options.api, item.title, folder)
              : null;
            if (existing) {
              await options.api.updateDocument(existing.id, payload);
              push(result, item.title, item.path, 'updated', labels.documentUpdated(formatOptionalTarget(rootPath)), wiseMindTargetLabel(labels.document, rootPath, labels));
            } else {
              await options.api.createDocument(payload);
              push(result, item.title, item.path, 'created', labels.documentCreated(formatOptionalTarget(rootPath)), wiseMindTargetLabel(labels.document, rootPath, labels));
            }
          }
        }

        if (options.targets.knowledge) {
          for (const baseName of knowledgeBaseNames) {
            if (!knowledgeBaseCache.has(baseName)) {
              const base: any = await options.api.resolveKnowledgeBase(baseName, {
                icon: '📚',
                desc: labels.knowledgeDesc,
              });
              knowledgeBaseCache.set(baseName, base?.id ?? null);
            }
            const knowledgeBaseId = knowledgeBaseCache.get(baseName);
            const baseId = normalizeRemoteId(knowledgeBaseId);
            const markdownFilePath = await getConvertedMarkdownFilePath();
            const payload = {
              knowledgeBaseId: normalizeRemoteId(knowledgeBaseId),
              title: item.title,
              content: markdown,
              summary: '',
              fileUrl: markdownFilePath,
              fileType: 'md',
              fileExt: 'md',
              type: 'upload',
              sourceId: 0,
              size: item.size,
              loadingStatus: null,
              embeddingStatus: null,
            };
            const existing = options.duplicatePolicy === 'update'
              ? await findExistingKnowledgeDocument(options.api, item.title, baseId)
              : null;
            if (existing) {
              await options.api.updateKnowledgeDocument(existing.id, payload);
              push(result, item.title, item.path, 'updated', labels.knowledgeUpdated(baseName), wiseMindTargetLabel(labels.knowledge, baseName, labels));
            } else {
              await options.api.createKnowledgeDocument(payload);
              push(result, item.title, item.path, 'created', labels.knowledgeCreated(baseName), wiseMindTargetLabel(labels.knowledge, baseName, labels));
            }
          }
        }
      } catch (error: any) {
        push(result, item.title, item.path, 'failed', error?.message || labels.failed, labels.failedTarget);
      }
      options.onProgress?.(result);
    }
  }

  return result;
};

const normalizeRemoteId = (id: string | number | null | undefined) => id === null || id === undefined || id === '' ? null : String(id);
const normalizeTitle = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const formatOptionalTarget = (value: string) => (value ? `: ${value}` : '');
const wiseMindTargetLabel = (
  type: string,
  value: string,
  labels: ObsidianToWiseMindImportLabels,
) => `${type}: ${value || labels.rootFolder}`;

const findExistingNote = async (api: WiseMindApiClient, title: string, folder: string | null) => {
  const items = await api.listNotes({ q: title, from_folder: folder ?? undefined, limit: 200 }).catch(() => []);
  return items.find(item => normalizeTitle(item.title) === title);
};

const findExistingDocument = async (api: WiseMindApiClient, title: string, folder: string | null) => {
  const items = await api.listDocuments({ q: title, from_folder: folder ?? undefined, includeFolders: false, limit: 200 }).catch(() => []);
  return items.find(item => normalizeTitle(item.name || item.title) === title);
};

const findExistingKnowledgeDocument = async (api: WiseMindApiClient, title: string, knowledgeBaseId: string | null) => {
  if (!knowledgeBaseId) return null;
  const items = await api.listKnowledgeDocuments(knowledgeBaseId, title).catch(() => []);
  return items.find(item => normalizeTitle(item.title) === title);
};

const resolvePathFolder = async (
  folderPath: string,
  cache: Map<string, string | number | null>,
  resolver: (name: string, parent?: string | number | null) => Promise<any>,
) => {
  if (!folderPath) return null;
  if (cache.has(folderPath)) return cache.get(folderPath) ?? null;
  let parent: string | number | null = null;
  let currentPath = '';
  for (const name of folderPath.split('/').filter(Boolean)) {
    currentPath = currentPath ? `${currentPath}/${name}` : name;
    if (cache.has(currentPath)) {
      parent = cache.get(currentPath) ?? null;
      continue;
    }
    const folder = await resolver(name, parent);
    parent = folder?.id ?? folder?.data?.id ?? null;
    cache.set(currentPath, parent);
  }
  cache.set(folderPath, parent);
  return parent;
};

export const emptyResult = (): SyncRunResult => ({ created: 0, updated: 0, skipped: 0, failed: 0, items: [] });

export const push = (
  result: SyncRunResult,
  title: string,
  source: string,
  status: 'created' | 'updated' | 'skipped' | 'failed',
  message?: string,
  target?: string,
) => {
  result[status] += 1;
  result.items.push({ title, source, status, message, target });
};
