import type { App, TFile } from 'obsidian';

import { prepareWiseMindImagesForObsidian } from './markdownImages';
import { findSourceMarker } from './markers';
import { quoteYamlString, sanitizeFileName } from './text';
import type { DuplicatePolicy, SyncItemResult, WiseMindSourceItem } from './types';

export type ObsidianWriterLabels = {
  unnamedKnowledge: string;
  skippedSameSource: string;
};

const defaultLabels: ObsidianWriterLabels = {
  unnamedKnowledge: 'Untitled knowledge base',
  skippedSameSource: 'A file from the same source already exists',
};

export const buildObsidianDestinationPath = (
  item: WiseMindSourceItem,
  root: string,
  includeFolder = true,
  labels: ObsidianWriterLabels = defaultLabels,
) => {
  const safeRoot = trimSlashes(root);
  const safeTitle = sanitizeFileName(item.title, `${item.sourceType}-${item.id}`);
  const folder = includeFolder
    ? item.sourceType === 'note'
      ? item.folderPath || ''
      : item.sourceType === 'document'
        ? item.folderPath || ''
        : sanitizeFileName(item.knowledgeBaseName || labels.unnamedKnowledge, labels.unnamedKnowledge)
    : '';
  return normalizePath(`${safeRoot ? `${safeRoot}/` : ''}${folder}/${safeTitle}.md`);
};

export const buildObsidianFileContent = (item: WiseMindSourceItem, markdown = item.markdown) => {
  const lines = [
    '---',
    `title: ${quoteYamlString(item.title)}`,
    `wisemind_source_type: ${item.sourceType}`,
    `wisemind_source_id: ${quoteYamlString(String(item.id))}`,
    item.knowledgeBaseName ? `wisemind_knowledge_base: ${quoteYamlString(item.knowledgeBaseName)}` : '',
    item.tags.length ? `tags: ${JSON.stringify(item.tags)}` : '',
    '---',
    '',
    markdown,
  ].filter(line => line !== '');
  return lines.join('\n');
};

export const writeWiseMindItemToObsidian = async (
  app: App,
  item: WiseMindSourceItem,
  root: string,
  policy: DuplicatePolicy,
  includeFolder = true,
  labels: ObsidianWriterLabels = defaultLabels,
): Promise<SyncItemResult> => {
  const targetPath = buildObsidianDestinationPath(item, root, includeFolder, labels);
  const markdown = await prepareWiseMindImagesForObsidian(app, item.markdown, targetPath);
  const content = buildObsidianFileContent(item, markdown);
  const existingPath = await findExistingWiseMindFile(app, item, targetPath);

  if (existingPath) {
    const existingFile = app.vault.getAbstractFileByPath(existingPath) as TFile | null;
    if (policy === 'skip') {
      return { title: item.title, source: existingPath, target: `Obsidian: ${existingPath}`, status: 'skipped', message: labels.skippedSameSource };
    }
    if (policy === 'update' && existingFile) {
      await app.vault.modify(existingFile, content);
      return { title: item.title, source: existingPath, target: `Obsidian: ${existingPath}`, status: 'updated' };
    }
  }

  const finalPath = policy === 'duplicate' ? await nextAvailablePath(app, targetPath) : targetPath;
  await ensureFolder(app, finalPath.split('/').slice(0, -1).join('/'));
  await app.vault.create(finalPath, content);
  return { title: item.title, source: finalPath, target: `Obsidian: ${finalPath}`, status: 'created' };
};

export const ensureFolder = async (app: App, folderPath: string) => {
  const parts = folderPath.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
};

export const nextAvailablePath = async (app: App, path: string) => {
  if (!app.vault.getAbstractFileByPath(path)) return path;
  const dot = path.lastIndexOf('.');
  const base = dot === -1 ? path : path.slice(0, dot);
  const ext = dot === -1 ? '' : path.slice(dot);
  let index = 2;
  let candidate = `${base} ${index}${ext}`;
  while (app.vault.getAbstractFileByPath(candidate)) {
    index += 1;
    candidate = `${base} ${index}${ext}`;
  }
  return candidate;
};

const findExistingWiseMindFile = async (app: App, item: WiseMindSourceItem, fallbackPath: string) => {
  const fallback = app.vault.getAbstractFileByPath(fallbackPath);
  if (fallback) return fallbackPath;
  const fallbackFolder = folderOf(fallbackPath);
  const files = app.vault.getMarkdownFiles();
  for (const file of files) {
    if (folderOf(file.path) !== fallbackFolder) continue;
    const content = await app.vault.cachedRead(file);
    const marker = findSourceMarker(content);
    if (marker?.source === 'wisemind' && marker.type === item.sourceType && marker.id === String(item.id)) {
      return file.path;
    }
    if (hasWiseMindFrontmatter(content, item)) {
      return file.path;
    }
  }
  return '';
};

const hasWiseMindFrontmatter = (content: string, item: WiseMindSourceItem) =>
  new RegExp(`^wisemind_source_type:\\s*${escapeRegExp(item.sourceType)}\\s*$`, 'm').test(content) &&
  new RegExp(`^wisemind_source_id:\\s*"?${escapeRegExp(String(item.id))}"?\\s*$`, 'm').test(content);

const folderOf = (path: string) => path.includes('/') ? path.split('/').slice(0, -1).join('/') : '';
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, '');
const normalizePath = (value: string) => value.replace(/\/+/g, '/').replace(/\/\.md$/, '.md');
