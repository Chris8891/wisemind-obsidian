import {computed, onUnmounted, type Ref, ref, watch} from 'vue';
import {Notice} from 'obsidian';

import type {ObsidianSourceItem, WiseMindSourceItem} from '../../../types';

import {
  buildDestinationGroups,
  groupObsidianItems,
  groupWiseMindItems,
  matchesSearch,
  sourceKey,
  sourceMatchesCategory,
} from './syncGrouping';
import {SEARCH_DEBOUNCE_MS} from './types';
import type {SyncCore} from './useSyncCore';

// Filtering runs over the whole vault, so it follows the search boxes with a short delay; clearing is immediate.
const useDebouncedQuery = (source: Ref<string>) => {
  const value = ref(source.value);
  let timer = 0;
  watch(source, next => {
    window.clearTimeout(timer);
    if (!next.trim()) {
      value.value = next;
      return;
    }
    timer = window.setTimeout(() => {
      value.value = next;
    }, SEARCH_DEBOUNCE_MS);
  });
  onUnmounted(() => window.clearTimeout(timer));
  return value;
};

type KeySet = Ref<Set<string>>;

const toggleSetValue = (setRef: KeySet, key: string, checked: boolean) => {
  const next = new Set(setRef.value);
  if (checked) next.add(key);
  else next.delete(key);
  setRef.value = next;
};

const toggleGroup = <T>(setRef: KeySet, items: T[], keyOf: (item: T) => string) => {
  const keys = items.map(keyOf);
  const all = keys.length > 0 && keys.every(key => setRef.value.has(key));
  const next = new Set(setRef.value);
  keys.forEach(key => {
    if (all) next.delete(key);
    else next.add(key);
  });
  setRef.value = next;
};

// "Select all" adds the visible (possibly filtered) items, so searching never drops earlier picks.
const addAll = (setRef: KeySet, keys: string[]) => {
  setRef.value = new Set([...setRef.value, ...keys]);
};

/** Selection sets, search boxes and the grouped (filtered) lists both wizard pickers render from. */
export function useSyncSelection(core: SyncCore) {
  const {plugin, t, obsidianItems, wiseMindItems, snapshot, activeCategory} = core;

  const selectedObsidian = ref(new Set<string>());
  const selectedWiseMind = ref(new Set<string>());
  const selectedDestinations = ref(new Set<string>());
  const selectedObsidianFolders = ref(new Set<string>());
  const expandedGroups = ref(
    new Set<string>([
      'obsidian:root',
      'dest:documents',
      'target:root',
      `wisemind:documents:${t('syncPage.rootFolder')}`,
    ]),
  );
  const searchObsidian = ref('');
  const searchDestination = ref('');
  const searchWiseMind = ref('');
  const searchObsidianFolder = ref('');
  const obsidianQuery = useDebouncedQuery(searchObsidian);
  const destinationQuery = useDebouncedQuery(searchDestination);
  const wiseMindQuery = useDebouncedQuery(searchWiseMind);
  const obsidianFolderQuery = useDebouncedQuery(searchObsidianFolder);
  const newFolderName = ref('');

  const selectedWiseMindForActiveCategory = computed(() =>
    wiseMindItems.value.filter(
      item =>
        selectedWiseMind.value.has(sourceKey(item)) &&
        sourceMatchesCategory(item, activeCategory.value),
    ),
  );

  const obsidianGroups = computed(() => groupObsidianItems(t, obsidianItems.value, obsidianQuery.value));
  const wiseMindSourceGroups = computed(() =>
    groupWiseMindItems(
      t,
      wiseMindItems.value.filter(item => sourceMatchesCategory(item, activeCategory.value)),
      activeCategory.value,
      wiseMindQuery.value,
    ),
  );
  const destinationGroups = computed(() =>
    buildDestinationGroups(t, snapshot.value, destinationQuery.value),
  );

  const getObsidianFolders = () => {
    const folders = new Set<string>(['']);
    ((plugin.app.vault as any).getAllLoadedFiles?.() || []).forEach((file: any) => {
      if (file?.children && typeof file.path === 'string') folders.add(file.path);
    });
    obsidianItems.value.forEach(item => {
      const parts = item.folderPath.split('/').filter(Boolean);
      parts.forEach((_, index) => folders.add(parts.slice(0, index + 1).join('/')));
    });
    if (plugin.settings.defaultObsidianRootFolder)
      folders.add(plugin.settings.defaultObsidianRootFolder);
    selectedObsidianFolders.value.forEach(folder => folders.add(folder));
    return Array.from(folders).sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
  };
  const obsidianTargetFolders = computed(() =>
    getObsidianFolders().filter(folder =>
      matchesSearch(folder || t('syncPage.rootFolder'), obsidianFolderQuery.value),
    ),
  );

  const allDestinations = () => destinationGroups.value.flatMap(group => group.items);
  const filteredObsidianItems = () => obsidianGroups.value.flatMap(group => group.items);
  const filteredWiseMindItems = () => wiseMindSourceGroups.value.flatMap(group => group.items);

  const selectAllDestinations = () =>
    addAll(selectedDestinations, allDestinations().map(item => item.key));
  const clearAllDestinations = () => (selectedDestinations.value = new Set());
  const selectAllObsidian = () =>
    addAll(selectedObsidian, filteredObsidianItems().map(item => item.path));
  const clearAllObsidian = () => (selectedObsidian.value = new Set());
  const selectAllWiseMind = () => addAll(selectedWiseMind, filteredWiseMindItems().map(sourceKey));
  const clearAllWiseMind = () => (selectedWiseMind.value = new Set());
  const selectAllFolders = () => addAll(selectedObsidianFolders, obsidianTargetFolders.value);
  const clearAllFolders = () => (selectedObsidianFolders.value = new Set());

  const toggleObsidianGroup = (items: ObsidianSourceItem[]) =>
    toggleGroup(selectedObsidian, items, item => item.path);
  const toggleObsidianItem = (path: string, checked: boolean) =>
    toggleSetValue(selectedObsidian, path, checked);
  const toggleDestinationItem = (key: string, checked: boolean) =>
    toggleSetValue(selectedDestinations, key, checked);
  const toggleWiseMindGroup = (items: WiseMindSourceItem[]) =>
    toggleGroup(selectedWiseMind, items, sourceKey);
  const toggleWiseMindItem = (key: string, checked: boolean) =>
    toggleSetValue(selectedWiseMind, key, checked);
  const toggleFolder = (folder: string, checked: boolean) =>
    toggleSetValue(selectedObsidianFolders, folder, checked);
  const toggleExpanded = (id: string) => {
    const next = new Set(expandedGroups.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedGroups.value = next;
  };

  const createObsidianFolder = async () => {
    const folder = newFolderName.value.trim().replace(/^\/+|\/+$/g, '');
    if (!folder) {
      new Notice(t('syncPage.folderNameRequired'));
      return;
    }
    let current = '';
    try {
      for (const part of folder.split('/').filter(Boolean)) {
        current = current ? `${current}/${part}` : part;
        if (!plugin.app.vault.getAbstractFileByPath(current))
          await plugin.app.vault.createFolder(current);
      }
    } catch (error: any) {
      new Notice(t('syncPage.createFolderFailed', {message: error?.message || current}));
      return;
    }
    selectedObsidianFolders.value = new Set([...selectedObsidianFolders.value, folder]);
    newFolderName.value = '';
    new Notice(t('syncPage.folderSelected', {folder}));
  };

  return {
    selectedObsidian,
    selectedWiseMind,
    selectedDestinations,
    selectedObsidianFolders,
    selectedWiseMindForActiveCategory,
    expandedGroups,
    searchObsidian,
    searchDestination,
    searchWiseMind,
    searchObsidianFolder,
    obsidianQuery,
    destinationQuery,
    wiseMindQuery,
    obsidianFolderQuery,
    newFolderName,
    obsidianGroups,
    wiseMindSourceGroups,
    destinationGroups,
    obsidianTargetFolders,
    allDestinations,
    filteredObsidianItems,
    filteredWiseMindItems,
    selectAllDestinations,
    clearAllDestinations,
    selectAllObsidian,
    clearAllObsidian,
    selectAllWiseMind,
    clearAllWiseMind,
    selectAllFolders,
    clearAllFolders,
    toggleObsidianGroup,
    toggleObsidianItem,
    toggleDestinationItem,
    toggleWiseMindGroup,
    toggleWiseMindItem,
    toggleFolder,
    toggleExpanded,
    createObsidianFolder,
  };
}

export type SyncSelection = ReturnType<typeof useSyncSelection>;
