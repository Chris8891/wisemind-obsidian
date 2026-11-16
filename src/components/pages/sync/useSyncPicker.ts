import {computed, ref, watch} from 'vue';
import {BookmarkSquareIcon, DocumentTextIcon, FolderIcon} from '@heroicons/vue/24/outline';

import {countSelected, sourceKey, sourceTypeLabel} from './syncGrouping';
import {TREE_ROW_PAGE, type TreeView} from './types';
import type {SyncCore} from './useSyncCore';
import type {SyncSelection} from './useSyncSelection';
import type {SyncSummary} from './useSyncSummary';

/** Maps the shared search box, toolbar and tree of wizard steps 0 and 1 onto the list that is active. */
export function useSyncPicker(core: SyncCore, selection: SyncSelection, summary: SyncSummary) {
  const {t, direction, step, loading, connectionError, activeCategory} = core;
  const {
    selectedObsidian,
    selectedWiseMind,
    selectedDestinations,
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
    obsidianGroups,
    wiseMindSourceGroups,
    destinationGroups,
    obsidianTargetFolders,
  } = selection;
  const {sourceCount, targetCount, targetCountText, sourceMissingText, targetMissingText} = summary;

  const rowLimits = ref<Record<string, number>>({});
  const searchInputRef = ref<HTMLInputElement | null>(null);
  const isToWiseMind = () => direction.value === 'to-wisemind';

  const checkableGroupState = <T>(items: T[], selected: Set<string>, keyOf: (item: T) => string) => {
    const selectedCount = countSelected(items, selected, keyOf);
    return {
      selectedCount,
      checked: items.length > 0 && selectedCount === items.length,
      partial: selectedCount > 0 && selectedCount < items.length,
      countTitle: t('notePicker.groupSelected', {selected: selectedCount, total: items.length}),
    };
  };

  const isObsidianSourcePicker = computed(() => step.value === 0 && isToWiseMind());
  const isFolderPicker = computed(() => step.value === 1 && !isToWiseMind());
  const pickerSearch = computed({
    get: () => {
      if (step.value === 0) return isToWiseMind() ? searchObsidian.value : searchWiseMind.value;
      return isToWiseMind() ? searchDestination.value : searchObsidianFolder.value;
    },
    set: (value: string) => {
      if (step.value === 0 && isToWiseMind()) searchObsidian.value = value;
      else if (step.value === 0) searchWiseMind.value = value;
      else if (isToWiseMind()) searchDestination.value = value;
      else searchObsidianFolder.value = value;
    },
  });
  const activeQuery = computed(() => {
    if (step.value === 0) return isToWiseMind() ? obsidianQuery.value : wiseMindQuery.value;
    return isToWiseMind() ? destinationQuery.value : obsidianFolderQuery.value;
  });
  const pickerHeader = computed(() => {
    if (step.value === 0)
      return isToWiseMind()
        ? {title: t('syncPage.obsidianVault'), desc: t('syncPage.chooseMarkdown')}
        : {title: t('syncPage.wiseMindLocalData'), desc: t('syncPage.chooseWriteBackContent')};
    return isToWiseMind()
      ? {title: t('syncPage.saveToWiseMind'), desc: t('syncPage.chooseTarget')}
      : {title: t('syncPage.writeToObsidian'), desc: t('syncPage.chooseTargetFolder')};
  });
  const pickerPlaceholder = computed(() => {
    if (step.value === 0)
      return isToWiseMind() ? t('syncPage.searchNotes') : t('syncPage.searchContent');
    return isToWiseMind() ? t('syncPage.searchTarget') : t('syncPage.searchObsidianFolder');
  });
  const pickerCountText = computed(() => {
    if (step.value === 0)
      return isToWiseMind()
        ? t('syncPage.selectedNotesShort', {count: selectedObsidian.value.size})
        : t('syncPage.selectedItems', {count: selectedWiseMindForActiveCategory.value.length});
    return targetCountText.value;
  });
  const pickerError = computed(() =>
    isObsidianSourcePicker.value || isFolderPicker.value ? '' : connectionError.value,
  );
  const wiseMindEmptyText = computed(() => {
    if (loading.value) return t('syncPage.loadingWiseMind');
    if (searchWiseMind.value.trim()) return t('syncPage.noMatchedWiseMind');
    if (activeCategory.value === 'knowledge') return t('syncPage.noKnowledgeDocs');
    if (activeCategory.value === 'notes') return t('syncPage.noWiseMindNotes');
    return t('syncPage.noWiseMindDocuments');
  });
  const treeEmptyText = computed(() => {
    if (step.value === 0 && !isToWiseMind()) return wiseMindEmptyText.value;
    if (step.value === 1 && loading.value) return t('syncPage.loadingWiseMind');
    if (loading.value) return t('destinationSelect.loading');
    return t('shared.noMatches');
  });

  // Large vaults can hold thousands of notes per folder: rows are only built for expanded groups and
  // rendered in pages so toggling a checkbox or typing a query stays responsive.
  const visibleGroupItems = <T>(id: string, items: T[]) =>
    expandedGroups.value.has(id) ? items.slice(0, rowLimits.value[id] || TREE_ROW_PAGE) : [];
  const destinationTree = (): TreeView[] =>
    destinationGroups.value.map(group => ({
      id: group.id,
      title: group.title,
      countTitle: group.subtitle || '',
      checkable: false,
      checked: false,
      partial: false,
      selectedCount: countSelected(group.items, selectedDestinations.value, item => item.key),
      icon: group.id === 'dest:knowledge' ? BookmarkSquareIcon : FolderIcon,
      rowIcon: group.id === 'dest:knowledge' ? BookmarkSquareIcon : FolderIcon,
      total: group.items.length,
      rows: visibleGroupItems(group.id, group.items).map(item => ({
        key: item.key,
        title: item.title,
        meta: item.meta,
        checked: selectedDestinations.value.has(item.key),
      })),
    }));
  const obsidianTree = (): TreeView[] =>
    obsidianGroups.value.map(group => ({
      id: group.id,
      title: group.title,
      ...checkableGroupState(group.items, selectedObsidian.value, item => item.path),
      checkable: true,
      icon: FolderIcon,
      rowIcon: DocumentTextIcon,
      total: group.items.length,
      rows: visibleGroupItems(group.id, group.items).map(item => ({
        key: item.path,
        title: item.title,
        meta: item.path,
        checked: selectedObsidian.value.has(item.path),
      })),
    }));
  const wiseMindTree = (): TreeView[] =>
    wiseMindSourceGroups.value.map(group => ({
      id: group.id,
      title: group.title,
      ...checkableGroupState(group.items, selectedWiseMind.value, sourceKey),
      checkable: true,
      icon: activeCategory.value === 'knowledge' ? BookmarkSquareIcon : FolderIcon,
      rowIcon: DocumentTextIcon,
      total: group.items.length,
      rows: visibleGroupItems(group.id, group.items).map(item => ({
        key: sourceKey(item),
        title: item.title,
        meta:
          item.sourceType === 'knowledge-document'
            ? item.knowledgeBaseName || ''
            : sourceTypeLabel(t, item.sourceType),
        checked: selectedWiseMind.value.has(sourceKey(item)),
      })),
    }));
  const activeTree = computed<TreeView[]>(() => {
    if (step.value === 1) return destinationTree();
    return isToWiseMind() ? obsidianTree() : wiseMindTree();
  });

  const showMoreRows = (id: string) => {
    rowLimits.value = {...rowLimits.value, [id]: (rowLimits.value[id] || TREE_ROW_PAGE) + TREE_ROW_PAGE};
  };

  const pickerAvailableCount = computed(() => {
    if (step.value === 0)
      return isToWiseMind()
        ? selection.filteredObsidianItems().length
        : selection.filteredWiseMindItems().length;
    return isToWiseMind() ? selection.allDestinations().length : obsidianTargetFolders.value.length;
  });
  const pickerSelectedCount = computed(() => (step.value === 0 ? sourceCount.value : targetCount.value));
  // Why the wizard cannot move forward; shown next to the disabled primary button instead of a Notice.
  const blockedReason = computed(() => {
    if (!sourceCount.value) return sourceMissingText.value;
    if (step.value >= 1 && !targetCount.value) return targetMissingText.value;
    return '';
  });
  const showNoMatches = computed(
    () => !loading.value && !!pickerSearch.value.trim() && !!activeQuery.value.trim(),
  );

  const clearSearch = () => {
    pickerSearch.value = '';
    searchInputRef.value?.focus();
  };
  const onSearchKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !pickerSearch.value) return;
    event.preventDefault();
    event.stopPropagation();
    pickerSearch.value = '';
  };

  const toggleTreeGroup = (groupId: string) => {
    if (isToWiseMind()) {
      const group = obsidianGroups.value.find(item => item.id === groupId);
      if (group) selection.toggleObsidianGroup(group.items);
      return;
    }
    const group = wiseMindSourceGroups.value.find(item => item.id === groupId);
    if (group) selection.toggleWiseMindGroup(group.items);
  };
  const toggleTreeRow = (key: string, event: Event) => {
    const checked = (event.target as HTMLInputElement).checked;
    if (step.value === 1) selection.toggleDestinationItem(key, checked);
    else if (isToWiseMind()) selection.toggleObsidianItem(key, checked);
    else selection.toggleWiseMindItem(key, checked);
  };
  const selectAllPicker = () => {
    if (step.value === 0) {
      if (isToWiseMind()) selection.selectAllObsidian();
      else selection.selectAllWiseMind();
    } else if (isToWiseMind()) selection.selectAllDestinations();
    else selection.selectAllFolders();
  };
  const clearAllPicker = () => {
    if (step.value === 0) {
      if (isToWiseMind()) selection.clearAllObsidian();
      else selection.clearAllWiseMind();
    } else if (isToWiseMind()) selection.clearAllDestinations();
    else selection.clearAllFolders();
  };

  // Matching groups open automatically while searching; otherwise matches hide inside collapsed folders.
  watch([obsidianQuery, wiseMindQuery, destinationQuery], () => {
    if (!pickerSearch.value.trim()) return;
    const next = new Set(expandedGroups.value);
    activeTree.value.slice(0, 20).forEach(group => next.add(group.id));
    expandedGroups.value = next;
  });

  return {
    searchInputRef,
    isFolderPicker,
    pickerSearch,
    activeQuery,
    pickerHeader,
    pickerPlaceholder,
    pickerCountText,
    pickerError,
    treeEmptyText,
    activeTree,
    showMoreRows,
    pickerAvailableCount,
    pickerSelectedCount,
    blockedReason,
    showNoMatches,
    clearSearch,
    onSearchKeydown,
    toggleTreeGroup,
    toggleTreeRow,
    selectAllPicker,
    clearAllPicker,
  };
}

export type SyncPicker = ReturnType<typeof useSyncPicker>;
