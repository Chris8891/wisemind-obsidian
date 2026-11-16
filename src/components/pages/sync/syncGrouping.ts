import type {
  ObsidianSourceItem,
  WiseMindFolder,
  WiseMindSnapshot,
  WiseMindSourceItem,
} from '../../../types';
import {resolveFolderPath} from '../../../wisemindSourceScanner';

import type {DestinationItem, TextPart, TreeGroup, WiseMindCategory} from './types';

export type Translate = (key: string, params?: Record<string, unknown>) => string;

export const sourceKey = (item: WiseMindSourceItem) => `${item.sourceType}:${item.id}`;

export const sourceMatchesCategory = (item: WiseMindSourceItem, category: WiseMindCategory) =>
  (category === 'documents' && item.sourceType === 'document') ||
  (category === 'knowledge' && item.sourceType === 'knowledge-document') ||
  (category === 'notes' && item.sourceType === 'note');

export const sourceTypeLabel = (t: Translate, value: WiseMindSourceItem['sourceType']) => {
  if (value === 'document') return t('syncPage.documents');
  if (value === 'knowledge-document') return t('syncPage.knowledge');
  return t('syncPage.notes');
};

export const matchesSearch = (value: string, query: string) =>
  !query.trim() || value.toLowerCase().includes(query.trim().toLowerCase());

export const countSelected = <T>(items: T[], selected: Set<string>, keyOf: (item: T) => string) =>
  items.reduce((count, item) => count + (selected.has(keyOf(item)) ? 1 : 0), 0);

export const getFullySelectedGroupIds = <T>(
  groups: TreeGroup<T>[],
  selected: Set<string>,
  keyOf: (item: T) => string,
) =>
  groups
    .filter(group => group.items.length > 0 && group.items.every(item => selected.has(keyOf(item))))
    .map(group => group.id);

export const highlightParts = (text: string, query: string): TextPart[] => {
  const needle = query.trim().toLowerCase();
  const lower = text.toLowerCase();
  if (!needle || lower.length !== text.length) return [{text, hit: false}];
  const parts: TextPart[] = [];
  let cursor = 0;
  let index = lower.indexOf(needle);
  while (index !== -1) {
    if (index > cursor) parts.push({text: text.slice(cursor, index), hit: false});
    parts.push({text: text.slice(index, index + needle.length), hit: true});
    cursor = index + needle.length;
    index = lower.indexOf(needle, cursor);
  }
  if (cursor < text.length) parts.push({text: text.slice(cursor), hit: false});
  return parts.length ? parts : [{text, hit: false}];
};

const pushToGroup = <T>(groups: Map<string, T[]>, key: string, item: T) => {
  const list = groups.get(key);
  if (list) list.push(item);
  else groups.set(key, [item]);
};

export const groupObsidianItems = (
  t: Translate,
  items: ObsidianSourceItem[],
  query: string,
): TreeGroup<ObsidianSourceItem>[] => {
  const groups = new Map<string, ObsidianSourceItem[]>();
  items
    .filter(item => matchesSearch(`${item.title} ${item.path}`, query))
    .forEach(item => pushToGroup(groups, item.folderPath || t('syncPage.rootFolder'), item));
  return Array.from(groups.entries()).map(([folder, groupItems]) => ({
    id: `obsidian:${folder}`,
    title: folder,
    items: groupItems,
  }));
};

export const groupWiseMindItems = (
  t: Translate,
  items: WiseMindSourceItem[],
  category: WiseMindCategory,
  query: string,
): TreeGroup<WiseMindSourceItem>[] => {
  const groups = new Map<string, WiseMindSourceItem[]>();
  items
    .filter(item =>
      matchesSearch(`${item.title} ${item.folderPath} ${item.knowledgeBaseName || ''}`, query),
    )
    .forEach(item => {
      const group =
        category === 'knowledge'
          ? item.knowledgeBaseName || t('syncPage.knowledge')
          : item.folderPath || t('syncPage.rootFolder');
      pushToGroup(groups, group, item);
    });
  return Array.from(groups.entries()).map(([title, groupItems]) => ({
    id: `wisemind:${category}:${title}`,
    title,
    items: groupItems,
  }));
};

const folderDestinations = (
  t: Translate,
  target: 'notes' | 'documents',
  folders: WiseMindFolder[],
  rootTitle: string,
): DestinationItem[] => [
  {key: `${target}:`, target, value: '', title: rootTitle, meta: t('syncPage.rootFolder')},
  ...folders.map(folder => {
    const path = resolveFolderPath(folder.id, folders) || folder.name;
    return {
      key: `${target}:${path}`,
      target,
      value: path,
      title: path,
      meta: t('syncPage.folder'),
    };
  }),
];

export const buildDestinationGroups = (
  t: Translate,
  data: WiseMindSnapshot | null,
  query: string,
): TreeGroup<DestinationItem>[] => {
  if (!data) return [];
  const noteFolders = folderDestinations(t, 'notes', data.noteFolders || [], t('syncPage.rootFolder'));
  const docFolders = folderDestinations(
    t,
    'documents',
    data.documentFolders || [],
    t('syncPage.rootFolder'),
  );
  const knowledgeBases = (data.knowledgeBases || []).map((base: any) => ({
    key: `knowledge:${base.name || base.title || base.id}`,
    target: 'knowledge' as const,
    value: String(base.name || base.title || base.id || ''),
    title: String(base.name || base.title || `knowledge-${base.id}`),
    meta: t('syncPage.knowledge'),
  }));
  return [
    {
      id: 'dest:notes',
      title: t('syncPage.notes'),
      subtitle: t('syncPage.selectedFolders', {count: noteFolders.length}),
      items: noteFolders,
    },
    {
      id: 'dest:documents',
      title: t('syncPage.documents'),
      subtitle: t('syncPage.selectedFolders', {count: docFolders.length}),
      items: docFolders,
    },
    {
      id: 'dest:knowledge',
      title: t('syncPage.knowledge'),
      subtitle: t('syncPage.knowledgeBasesCount', {count: knowledgeBases.length}),
      items: knowledgeBases,
    },
  ]
    .map(group => ({
      ...group,
      items: group.items.filter(item => matchesSearch(`${item.title} ${item.meta}`, query)),
    }))
    .filter(group => group.items.length);
};

export const getDefaultDestinationKeys = (
  t: Translate,
  data: WiseMindSnapshot | null,
  preferredKnowledgeBase: string,
) => {
  const keys: string[] = [];
  buildDestinationGroups(t, data, '').forEach(group => {
    if (group.id === 'dest:notes' || group.id === 'dest:documents') {
      const root = group.items.find(item => item.value === '');
      if (root) keys.push(root.key);
    }
    if (group.id === 'dest:knowledge') {
      const preferred =
        group.items.find(item => item.title === preferredKnowledgeBase) || group.items[0];
      if (preferred) keys.push(preferred.key);
    }
  });
  return keys;
};
