<script setup lang="ts">
  import {computed, nextTick, onMounted, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowPathIcon,
    ArrowRightIcon,
    BookmarkSquareIcon,
    CheckCircleIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    ClockIcon,
    DocumentTextIcon,
    FolderIcon,
    PencilSquareIcon,
    PlusIcon,
    TrashIcon,
  } from '@heroicons/vue/24/outline';
  import {Notice} from 'obsidian';
  import {ToggleGroupItem, ToggleGroupRoot} from 'reka-ui';

  import {usePlugin} from '../../composables/usePlugin';
  import {useWiseMindConnectionGuard} from '../../composables/useWiseMindConnectionGuard';
  import {runObsidianToWiseMindImport} from '../../importRunner';
  import {upsertPluginTask} from '../../services/pluginTaskProgress';
  import {buildSyncPreview, type SyncPreview} from '../../services/syncPreview';
  import type {
    ObsidianSourceItem,
    SyncHistoryItem,
    SyncPlan,
    SyncRunResult,
    WiseMindFolder,
    WiseMindSnapshot,
    WiseMindSourceItem,
    WiseMindWorkspaceState,
  } from '../../types';
  import {scanVault} from '../../vaultScanner';
  import {loadWiseMindSources, resolveFolderPath} from '../../wisemindSourceScanner';
  import {runWiseMindToObsidianImport} from '../../wisemindToObsidianRunner';
  import WiseMindConnectionDialog from '../WiseMindConnectionDialog.vue';
  import WmDialog from '../WmDialog.vue';
  import WmTooltip from '../WmTooltip.vue';

  const props = defineProps<{
    historyItemId?: string;
    historyToken?: number;
  }>();
  const emit = defineEmits<{
    openHistory: [];
  }>();

  type Direction = 'to-wisemind' | 'to-obsidian';
  type WiseMindCategory = 'documents' | 'knowledge' | 'notes';
  type DestinationTarget = 'notes' | 'documents' | 'knowledge';
  type TreeGroup<T> = {id: string; title: string; subtitle?: string; items: T[]};
  type DestinationItem = {
    key: string;
    target: DestinationTarget;
    value: string;
    title: string;
    meta: string;
  };

  const plugin = usePlugin();
  const {t} = useI18n();
  const {connectionDialogOpen, ensureWiseMindConnected} = useWiseMindConnectionGuard();
  const direction = ref<Direction>('to-wisemind');
  const running = ref(false);
  const loading = ref(false);
  const connectionError = ref('');
  const result = ref<SyncRunResult | null>(null);
  const resultDialogOpen = ref(false);
  const previewDialogOpen = ref(false);
  const pendingSyncPreview = ref<SyncPreview | null>(null);
  const selectedSyncHistory = ref<SyncHistoryItem | null>(null);
  const hasLoadedObsidianItems = ref(false);
  const obsidianItems = ref<ObsidianSourceItem[]>([]);
  const wiseMindItems = ref<WiseMindSourceItem[]>([]);
  const snapshot = ref<WiseMindSnapshot | null>(null);
  const workspaceState = ref<WiseMindWorkspaceState | null>(null);
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
  const activeCategory = ref<WiseMindCategory>('documents');
  const includeFolderStructure = ref(true);
  const overwriteExisting = ref(plugin.settings.duplicatePolicy === 'update');
  const newFolderName = ref('');
  const planPickerOpen = ref(false);
  const savePlanOpen = ref(false);
  const renamePlanOpen = ref(false);
  const deletePlanOpen = ref(false);
  const pendingPlanName = ref('');
  const pendingRenamePlanName = ref('');
  const pendingRenamePlan = ref<SyncPlan | null>(null);
  const pendingDeletePlan = ref<SyncPlan | null>(null);
  const settingsRevision = ref(0);

  const setDirection = (value: unknown) => {
    if (value === 'to-wisemind' || value === 'to-obsidian') direction.value = value;
  };

  const stats = computed(() => {
    const markdownKnowledgeBases = new Set(
      wiseMindItems.value
        .filter(item => item.sourceType === 'knowledge-document')
        .map(item => item.knowledgeBaseName || '')
        .filter(Boolean),
    );
    return {
      obsidian: obsidianItems.value.length,
      notes: wiseMindItems.value.filter(item => item.sourceType === 'note').length,
      documents: wiseMindItems.value.filter(item => item.sourceType === 'document').length,
      knowledge: markdownKnowledgeBases.size || snapshot.value?.knowledgeBases?.length || 0,
    };
  });

  const currentWiseMindWorkspaceName = computed(() => {
    const activeId = workspaceState.value?.activeWorkspaceId;
    if (!activeId) return t('syncPage.noWorkspace');
    return workspaceState.value?.workspaces.find(item => item.id === activeId)?.name || activeId;
  });

  const wiseMindWorkspaceScopeText = computed(() =>
    t('syncPage.currentWorkspaceScope', {name: currentWiseMindWorkspaceName.value}),
  );

  const selectedHint = computed(() => {
    if (direction.value === 'to-wisemind') {
      return t('syncPage.selectedToWiseMind', {
        sourceCount: selectedObsidian.value.size,
        targetCount: selectedDestinations.value.size,
      });
    }
    return t('syncPage.selectedToObsidian', {
      sourceCount: selectedWiseMindForActiveCategory.value.length,
      targetCount: selectedObsidianFolders.value.size,
    });
  });

  const selectedWiseMindForActiveCategory = computed(() =>
    wiseMindItems.value.filter(
      item =>
        selectedWiseMind.value.has(sourceKey(item)) &&
        sourceMatchesCategory(item, activeCategory.value),
    ),
  );

  const selectedGroupLabel = <T,>(items: T[], selected: Set<string>, keyOf: (item: T) => string) =>
    t('notePicker.groupSelected', {
      selected: items.filter(item => selected.has(keyOf(item))).length,
      total: items.length,
    });

  const importRunnerLabels = () => ({
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
    failed: t('importRunner.failed'),
    failedTarget: t('importRunner.failedTarget'),
  });

  const obsidianWriterLabels = () => ({
    unnamedKnowledge: t('obsidianWriter.unnamedKnowledge'),
    skippedSameSource: t('obsidianWriter.skippedSameSource'),
    syncFailed: t('obsidianWriter.syncFailed'),
    failedTarget: t('obsidianWriter.failedTarget'),
  });

  const fallbackSyncTarget = (history: SyncHistoryItem | null) =>
    history?.targetLabel ||
    (direction.value === 'to-wisemind' ? wiseMindWorkspaceScopeText.value : 'Obsidian');

  const syncResultRows = computed(() =>
    (result.value?.items || []).map(item => ({
      title: item.title,
      target: item.target || fallbackSyncTarget(selectedSyncHistory.value),
      status: item.status,
      message: item.message || '',
    })),
  );
  const syncStatusLabels = {
    created: t('syncPage.created'),
    updated: t('syncPage.updated'),
    skipped: t('syncPage.skipped'),
    failed: t('syncPage.failed'),
  } as const;
  const syncResultGroups = computed(() =>
    (['failed', 'created', 'updated', 'skipped'] as const)
      .map(status => ({
        status,
        label: syncStatusLabels[status],
        rows: syncResultRows.value.filter(item => item.status === status),
      }))
      .filter(group => group.rows.length),
  );

  const selectedSyncHistoryRows = computed(() => {
    const history = selectedSyncHistory.value;
    if (!history) return [];
    if (history.syncItems?.length) return history.syncItems;
    return history.itemTitles.map(title => ({
      title,
      target: fallbackSyncTarget(history),
      status: 'created' as const,
    }));
  });

  const obsidianGroups = computed(() =>
    groupObsidianItems(obsidianItems.value, searchObsidian.value),
  );
  const wiseMindSourceGroups = computed(() =>
    groupWiseMindItems(
      wiseMindItems.value.filter(item => sourceMatchesCategory(item, activeCategory.value)),
      activeCategory.value,
      searchWiseMind.value,
    ),
  );
  const destinationGroups = computed(() =>
    buildDestinationGroups(snapshot.value, searchDestination.value),
  );
  const obsidianTargetFolders = computed(() =>
    getObsidianFolders().filter(folder =>
      matchesSearch(folder || t('syncPage.rootFolder'), searchObsidianFolder.value),
    ),
  );
  const wiseMindEmptyText = computed(() => {
    if (loading.value) return t('syncPage.loadingWiseMind');
    if (searchWiseMind.value.trim()) return t('syncPage.noMatchedWiseMind');
    if (activeCategory.value === 'knowledge') return t('syncPage.noKnowledgeDocs');
    if (activeCategory.value === 'notes') return t('syncPage.noWiseMindNotes');
    return t('syncPage.noWiseMindDocuments');
  });
  const sortedPlans = computed(
    () => (
      settingsRevision.value,
      [...(plugin.settings.syncPlans || [])].sort((a, b) => b.updatedAt - a.updatedAt)
    ),
  );
  const activePlanName = computed(
    () => (
      settingsRevision.value,
      plugin.settings.syncPlans.find(plan => plan.id === plugin.settings.defaultSyncPlanId)?.name ||
        ''
    ),
  );
  const currentPlanSummary = computed(() => [
    {
      label: t('syncPage.syncDirection'),
      values: [
        direction.value === 'to-wisemind'
          ? t('syncPage.toWiseMindDirection')
          : t('syncPage.toObsidianDirection'),
      ],
      emptyText: '',
    },
    {
      label:
        direction.value === 'to-wisemind'
          ? t('syncPage.selectedContent')
          : t('syncPage.selectedWiseMindContent'),
      values: [
        direction.value === 'to-wisemind'
          ? t('syncPage.obsidianNoteCount', {count: selectedObsidian.value.size})
          : t('syncPage.wiseMindContentCount', {
              count: selectedWiseMindForActiveCategory.value.length,
            }),
      ],
      emptyText: t('syncPage.noSelectedContent'),
    },
    {
      label: t('syncPage.sourceFolder'),
      values:
        direction.value === 'to-wisemind'
          ? getFullySelectedGroupIds(
              obsidianGroups.value,
              selectedObsidian.value,
              item => item.path,
            ).map(id => id.replace(/^obsidian:/, ''))
          : getFullySelectedGroupIds(
              wiseMindSourceGroups.value,
              selectedWiseMind.value,
              sourceKey,
            ).map(id => id.split(':').slice(2).join(':')),
      emptyText: t('syncPage.noFullFolder'),
    },
    {
      label:
        direction.value === 'to-wisemind' ? t('syncPage.saveTo') : t('syncPage.writeToObsidian'),
      values:
        direction.value === 'to-wisemind'
          ? allDestinations()
              .filter(item => selectedDestinations.value.has(item.key))
              .map(item => item.title)
          : Array.from(selectedObsidianFolders.value).map(
              folder => folder || t('syncPage.rootFolder'),
            ),
      emptyText: t('syncPage.noSelectedTarget'),
    },
  ]);

  const touchSettings = () => {
    settingsRevision.value += 1;
  };

  const refresh = async () => {
    loading.value = true;
    connectionError.value = '';
    try {
      obsidianItems.value = await scanVault(plugin.app, {
        maxFileSizeKb: plugin.settings.maxFileSizeKb,
        ignorePatterns: plugin.settings.ignorePatterns,
      });
      const availablePaths = new Set(obsidianItems.value.map(item => item.path));
      selectedObsidian.value = hasLoadedObsidianItems.value
        ? new Set([...selectedObsidian.value].filter(path => availablePaths.has(path)))
        : new Set();
      hasLoadedObsidianItems.value = true;
      selectedObsidianFolders.value = new Set([plugin.settings.defaultObsidianRootFolder || '']);
    } catch (error: any) {
      new Notice(error?.message || t('syncPage.scanObsidianFailed'));
    }

    try {
      workspaceState.value = await plugin.api.getWorkspaceState().catch(() => null);
      const loaded = await loadWiseMindSources(plugin.api, {
        includeNotes: true,
        includeDocuments: true,
        includeKnowledgeDocuments: true,
      });
      snapshot.value = loaded.snapshot;
      wiseMindItems.value = loaded.items;
      selectedWiseMind.value = new Set(
        [...selectedWiseMind.value].filter(key =>
          loaded.items.some(item => sourceKey(item) === key),
        ),
      );
      selectedDestinations.value = new Set(getDefaultDestinationKeys(loaded.snapshot));
      applyDefaultPlan();
    } catch (error: any) {
      connectionError.value = error?.message || t('syncPage.connectWiseMindFailed');
      snapshot.value = null;
      wiseMindItems.value = [];
      selectedWiseMind.value = new Set();
      selectedDestinations.value = new Set();
    } finally {
      loading.value = false;
    }
  };

  const buildCurrentSyncPreview = () =>
    buildSyncPreview(
      {
        direction: direction.value,
        sourceCount:
          direction.value === 'to-wisemind'
            ? selectedObsidian.value.size
            : selectedWiseMindForActiveCategory.value.length,
        targetLabels:
          direction.value === 'to-wisemind'
            ? allDestinations()
                .filter(item => selectedDestinations.value.has(item.key))
                .map(item => `${item.meta}: ${item.title}`)
                .concat(wiseMindWorkspaceScopeText.value)
            : Array.from(selectedObsidianFolders.value).map(
                folder => folder || t('syncPage.rootFolder'),
              ),
        overwriteExisting:
          direction.value === 'to-wisemind'
            ? overwriteExisting.value
            : plugin.settings.duplicatePolicy === 'update',
      },
      {
        obsidianNotes: t('syncPreview.obsidianNotes'),
        wiseMindContent: t('syncPreview.wiseMindContent'),
        wiseMindTarget: t('syncPreview.wiseMindTarget'),
        obsidianTarget: t('syncPreview.obsidianTarget'),
        title: params => t('syncPreview.title', params),
        unselected: t('syncPreview.unselected'),
        overwriteWarning: t('syncPreview.overwriteWarning'),
      },
    );

  const prepareExecute = async () => {
    if (!(await ensureWiseMindConnected())) return;
    if (direction.value === 'to-wisemind') {
      if (!selectedObsidian.value.size) {
        new Notice(t('syncPage.chooseObsidianFirst'));
        return;
      }
      if (!selectedDestinations.value.size) {
        new Notice(t('syncPage.chooseWiseMindTargetFirst'));
        return;
      }
    } else {
      if (!selectedWiseMindForActiveCategory.value.length) {
        new Notice(t('syncPage.chooseWiseMindContentFirst'));
        return;
      }
      if (!selectedObsidianFolders.value.size) {
        new Notice(t('syncPage.chooseObsidianFolderFirst'));
        return;
      }
    }
    pendingSyncPreview.value = buildCurrentSyncPreview();
    previewDialogOpen.value = true;
  };

  const executeConfirmed = async () => {
    const taskId = `sync-${Date.now()}`;
    running.value = true;
    result.value = null;
    resultDialogOpen.value = false;
    selectedSyncHistory.value = null;
    plugin.settings.duplicatePolicy = overwriteExisting.value ? 'update' : 'skip';
    await plugin.saveSettings();
    try {
      if (direction.value === 'to-wisemind') {
        const items = obsidianItems.value.filter(item => selectedObsidian.value.has(item.path));
        const destinations = allDestinations().filter(item =>
          selectedDestinations.value.has(item.key),
        );
        if (!items.length) {
          new Notice(t('syncPage.chooseObsidianFirst'));
          return;
        }
        if (!destinations.length) {
          new Notice(t('syncPage.chooseWiseMindTargetFirst'));
          return;
        }
        upsertPluginTask({
          id: taskId,
          title: t('syncPage.taskSyncToWiseMind'),
          status: 'running',
          total: items.length * Math.max(destinations.length, 1),
          completed: 0,
        });
        result.value = await runObsidianToWiseMindImport({
          items,
          app: plugin.app,
          api: plugin.api,
          targets: {
            notes: destinations.some(item => item.target === 'notes'),
            documents: destinations.some(item => item.target === 'documents'),
            knowledge: destinations.some(item => item.target === 'knowledge'),
          },
          noteFolderPaths: destinations
            .filter(item => item.target === 'notes')
            .map(item => item.value),
          documentFolderPaths: destinations
            .filter(item => item.target === 'documents')
            .map(item => item.value),
          knowledgeBaseNames: destinations
            .filter(item => item.target === 'knowledge')
            .map(item => item.value),
          duplicatePolicy: plugin.settings.duplicatePolicy,
          knowledgeBaseName: plugin.settings.contextMenuDefaults.knowledgeBaseName,
          chunkSize: plugin.settings.chunkSize,
          labels: importRunnerLabels(),
          onProgress: progress =>
            upsertPluginTask({
              id: taskId,
              title: t('syncPage.taskSyncToWiseMind'),
              status: 'running',
              total: items.length * Math.max(destinations.length, 1),
              completed: progress.items.length,
            }),
        });
      } else {
        const items = wiseMindItems.value.filter(item =>
          selectedWiseMind.value.has(sourceKey(item)),
        );
        const folders = Array.from(selectedObsidianFolders.value);
        if (!items.length) {
          new Notice(t('syncPage.chooseWiseMindContentFirst'));
          return;
        }
        if (!folders.length) {
          new Notice(t('syncPage.chooseObsidianFolderFirst'));
          return;
        }
        upsertPluginTask({
          id: taskId,
          title: t('syncPage.taskWriteToObsidian'),
          status: 'running',
          total: items.length * Math.max(folders.length, 1),
          completed: 0,
        });
        result.value = await runWiseMindToObsidianImport({
          app: plugin.app,
          items,
          rootFolder: plugin.settings.defaultObsidianRootFolder,
          rootFolders: folders,
          includeFolderStructure: includeFolderStructure.value,
          duplicatePolicy: plugin.settings.duplicatePolicy,
          chunkSize: plugin.settings.chunkSize,
          labels: obsidianWriterLabels(),
          onProgress: progress =>
            upsertPluginTask({
              id: taskId,
              title: t('syncPage.taskWriteToObsidian'),
              status: 'running',
              total: items.length * Math.max(folders.length, 1),
              completed: progress.items.length,
            }),
        });
      }

      if (result.value) {
        upsertPluginTask({
          id: taskId,
          title: t('syncPage.taskCompleted'),
          status: result.value.failed ? 'failed' : 'completed',
          total: result.value.items.length,
          completed: result.value.items.length,
          message: result.value.failed
            ? t('syncPage.failedCount', {count: result.value.failed})
            : '',
        });
        plugin.settings.syncHistory.unshift({
          id: `sync-${Date.now()}`,
          createdAt: Date.now(),
          direction: direction.value,
          sourceLabel:
            direction.value === 'to-wisemind'
              ? t('syncPage.obsidianVault')
              : t('syncPage.wiseMindLocalData'),
          targetLabel:
            direction.value === 'to-wisemind'
              ? wiseMindWorkspaceScopeText.value
              : t('syncPage.obsidianVault'),
          sourceFolders: [],
          targetFolders:
            direction.value === 'to-obsidian' ? Array.from(selectedObsidianFolders.value) : [],
          itemTitles: result.value.items.map(item => item.title),
          syncItems: result.value.items.map(item => ({
            title: item.title,
            target:
              item.target ||
              (direction.value === 'to-wisemind' ? wiseMindWorkspaceScopeText.value : 'Obsidian'),
            status: item.status,
          })),
          created: result.value.created,
          updated: result.value.updated,
          skipped: result.value.skipped,
          failed: result.value.failed,
        });
        plugin.settings.syncHistory = plugin.settings.syncHistory.slice(0, 50);
        await plugin.saveSettings();
        await nextTick();
        resultDialogOpen.value = true;
        new Notice(t('syncPage.taskCompleted'));
      }
    } catch (error: any) {
      upsertPluginTask({
        id: taskId,
        title: t('syncPage.taskFailed'),
        status: 'failed',
        message: error?.message || t('syncPage.taskFailed'),
      });
      new Notice(error?.message || t('syncPage.taskFailed'));
    } finally {
      running.value = false;
    }
  };

  const confirmExecute = async () => {
    previewDialogOpen.value = false;
    await executeConfirmed();
  };

  const createObsidianFolder = async () => {
    const folder = newFolderName.value.trim().replace(/^\/+|\/+$/g, '');
    if (!folder) {
      new Notice(t('syncPage.folderNameRequired'));
      return;
    }
    let current = '';
    for (const part of folder.split('/').filter(Boolean)) {
      current = current ? `${current}/${part}` : part;
      if (!plugin.app.vault.getAbstractFileByPath(current))
        await plugin.app.vault.createFolder(current);
    }
    selectedObsidianFolders.value = new Set([...selectedObsidianFolders.value, folder]);
    newFolderName.value = '';
    new Notice(t('syncPage.folderSelected', {folder}));
  };

  const toggleSetValue = (setRef: typeof selectedObsidian, key: string, checked: boolean) => {
    const next = new Set(setRef.value);
    if (checked) next.add(key);
    else next.delete(key);
    setRef.value = next;
  };

  const toggleGroup = <T,>(
    setRef: typeof selectedObsidian,
    items: T[],
    keyOf: (item: T) => string,
  ) => {
    const keys = items.map(keyOf);
    const all = keys.length > 0 && keys.every(key => setRef.value.has(key));
    const next = new Set(setRef.value);
    keys.forEach(key => {
      if (all) next.delete(key);
      else next.add(key);
    });
    setRef.value = next;
  };

  const toggleFolder = (folder: string, checked: boolean) => {
    const next = new Set(selectedObsidianFolders.value);
    if (checked) next.add(folder);
    else next.delete(folder);
    selectedObsidianFolders.value = next;
  };

  const toggleExpanded = (id: string) => {
    const next = new Set(expandedGroups.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedGroups.value = next;
  };

  const allDestinations = () => destinationGroups.value.flatMap(group => group.items);
  const selectAllDestinations = () =>
    (selectedDestinations.value = new Set(allDestinations().map(item => item.key)));
  const clearAllDestinations = () => (selectedDestinations.value = new Set());
  const selectAllObsidian = () =>
    (selectedObsidian.value = new Set(filteredObsidianItems().map(item => item.path)));
  const clearAllObsidian = () => (selectedObsidian.value = new Set());
  const selectAllWiseMind = () =>
    (selectedWiseMind.value = new Set(filteredWiseMindItems().map(sourceKey)));
  const clearAllWiseMind = () => (selectedWiseMind.value = new Set());
  const selectAllFolders = () =>
    (selectedObsidianFolders.value = new Set(obsidianTargetFolders.value));
  const clearAllFolders = () => (selectedObsidianFolders.value = new Set());

  const filteredObsidianItems = () => obsidianGroups.value.flatMap(group => group.items);
  const filteredWiseMindItems = () => wiseMindSourceGroups.value.flatMap(group => group.items);

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

  onMounted(() => void refresh());

  const sourceKey = (item: WiseMindSourceItem) => `${item.sourceType}:${item.id}`;
  const sourceMatchesCategory = (item: WiseMindSourceItem, category: WiseMindCategory) =>
    (category === 'documents' && item.sourceType === 'document') ||
    (category === 'knowledge' && item.sourceType === 'knowledge-document') ||
    (category === 'notes' && item.sourceType === 'note');

  const sourceTypeLabel = (value: WiseMindSourceItem['sourceType']) => {
    if (value === 'document') return t('syncPage.documents');
    if (value === 'knowledge-document') return t('syncPage.knowledge');
    return t('syncPage.notes');
  };

  const matchesSearch = (value: string, query: string) =>
    !query.trim() || value.toLowerCase().includes(query.trim().toLowerCase());

  const groupObsidianItems = (
    items: ObsidianSourceItem[],
    query: string,
  ): TreeGroup<ObsidianSourceItem>[] => {
    const groups = new Map<string, ObsidianSourceItem[]>();
    items
      .filter(item => matchesSearch(`${item.title} ${item.path}`, query))
      .forEach(item => {
        const folder = item.folderPath || t('syncPage.rootFolder');
        groups.set(folder, [...(groups.get(folder) || []), item]);
      });
    return Array.from(groups.entries()).map(([folder, groupItems]) => ({
      id: `obsidian:${folder}`,
      title: folder,
      items: groupItems,
    }));
  };

  const groupWiseMindItems = (
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
        groups.set(group, [...(groups.get(group) || []), item]);
      });
    return Array.from(groups.entries()).map(([title, groupItems]) => ({
      id: `wisemind:${category}:${title}`,
      title,
      items: groupItems,
    }));
  };

  const buildDestinationGroups = (
    data: WiseMindSnapshot | null,
    query: string,
  ): TreeGroup<DestinationItem>[] => {
    if (!data) return [];
    const noteFolders = folderDestinations(
      'notes',
      data.noteFolders || [],
      t('syncPage.rootFolder'),
    );
    const docFolders = folderDestinations(
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

  const folderDestinations = (
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

  const getDefaultDestinationKeys = (data: WiseMindSnapshot | null) => {
    const groups = buildDestinationGroups(data, '');
    const keys: string[] = [];
    groups.forEach(group => {
      if (group.id === 'dest:notes' || group.id === 'dest:documents') {
        const root = group.items.find(item => item.value === '');
        if (root) keys.push(root.key);
      }
      if (group.id === 'dest:knowledge') {
        const preferred =
          group.items.find(
            item => item.title === plugin.settings.contextMenuDefaults.knowledgeBaseName,
          ) || group.items[0];
        if (preferred) keys.push(preferred.key);
      }
    });
    return keys;
  };

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

  const getFullySelectedGroupIds = <T,>(
    groups: TreeGroup<T>[],
    selected: Set<string>,
    keyOf: (item: T) => string,
  ) =>
    groups
      .filter(
        group => group.items.length > 0 && group.items.every(item => selected.has(keyOf(item))),
      )
      .map(group => group.id);

  const createPlan = (name: string, id = `plan-${Date.now()}`): SyncPlan => ({
    id,
    name,
    direction: direction.value,
    obsidianPaths: Array.from(selectedObsidian.value),
    obsidianFolders: getFullySelectedGroupIds(
      obsidianGroups.value,
      selectedObsidian.value,
      item => item.path,
    ),
    wiseMindDestinationKeys: Array.from(selectedDestinations.value),
    obsidianTargetFolders: Array.from(selectedObsidianFolders.value),
    obsidianTargetFolder: Array.from(selectedObsidianFolders.value)[0] || '',
    wiseMindKeys: Array.from(selectedWiseMind.value),
    wiseMindGroupIds: getFullySelectedGroupIds(
      wiseMindSourceGroups.value,
      selectedWiseMind.value,
      sourceKey,
    ),
    wiseMindCategory: activeCategory.value,
    importTargets: {
      notes: selectedDestinations.value.has('notes:'),
      documents: selectedDestinations.value.has('documents:'),
      knowledge: Array.from(selectedDestinations.value).some(key => key.startsWith('knowledge:')),
    },
    updatedAt: Date.now(),
  });

  const applyPlan = (plan: SyncPlan) => {
    direction.value = plan.direction;
    activeCategory.value = plan.wiseMindCategory || 'documents';
    selectedDestinations.value = new Set(
      plan.wiseMindDestinationKeys?.length
        ? plan.wiseMindDestinationKeys
        : getDefaultDestinationKeys(snapshot.value),
    );
    selectedObsidianFolders.value = new Set(
      plan.obsidianTargetFolders?.length
        ? plan.obsidianTargetFolders
        : [plan.obsidianTargetFolder ?? plugin.settings.defaultObsidianRootFolder],
    );

    const obsidianPaths = new Set(plan.obsidianPaths || []);
    obsidianGroups.value.forEach(group => {
      if ((plan.obsidianFolders || []).includes(group.id)) {
        group.items.forEach(item => obsidianPaths.add(item.path));
      }
    });
    selectedObsidian.value = new Set(
      obsidianItems.value.filter(item => obsidianPaths.has(item.path)).map(item => item.path),
    );

    const wiseMindKeys = new Set(plan.wiseMindKeys || []);
    wiseMindSourceGroups.value.forEach(group => {
      if ((plan.wiseMindGroupIds || []).includes(group.id)) {
        group.items.forEach(item => wiseMindKeys.add(sourceKey(item)));
      }
    });
    selectedWiseMind.value = new Set(
      wiseMindItems.value.filter(item => wiseMindKeys.has(sourceKey(item))).map(sourceKey),
    );
  };

  const applyDefaultPlan = () => {
    const plan = plugin.settings.syncPlans.find(
      item => item.id === plugin.settings.defaultSyncPlanId,
    );
    if (plan) applyPlan(plan);
  };

  const openSavePlanDialog = () => {
    pendingPlanName.value = activePlanName.value || t('syncPage.defaultPlanName');
    savePlanOpen.value = true;
  };

  const saveCurrentAsPlan = async () => {
    const name = pendingPlanName.value.trim();
    if (!name) return;
    const plan = createPlan(name);
    plugin.settings.syncPlans = [plan, ...(plugin.settings.syncPlans || [])];
    plugin.settings.defaultSyncPlanId = plan.id;
    await plugin.saveSettings();
    touchSettings();
    savePlanOpen.value = false;
    new Notice(t('syncPage.planSaved'));
  };

  const applyAndSetDefaultPlan = async (plan: SyncPlan) => {
    applyPlan(plan);
    plugin.settings.defaultSyncPlanId = plan.id;
    await plugin.saveSettings();
    touchSettings();
    planPickerOpen.value = false;
    new Notice(t('syncPage.planApplied', {name: plan.name}));
  };

  const openRenamePlanDialog = (plan: SyncPlan) => {
    pendingRenamePlan.value = plan;
    pendingRenamePlanName.value = plan.name;
    renamePlanOpen.value = true;
  };

  const confirmRenamePlan = async () => {
    const plan = pendingRenamePlan.value;
    const name = pendingRenamePlanName.value.trim();
    if (!plan) return;
    if (!name) return;
    plan.name = name;
    plan.updatedAt = Date.now();
    await plugin.saveSettings();
    touchSettings();
    renamePlanOpen.value = false;
    pendingRenamePlan.value = null;
    new Notice(t('syncPage.planRenamed'));
  };

  const setDefaultPlan = async (plan: SyncPlan) => {
    plugin.settings.defaultSyncPlanId = plan.id;
    await plugin.saveSettings();
    touchSettings();
    new Notice(t('syncPage.planDefaultSet'));
  };

  const openDeletePlanDialog = (plan: SyncPlan) => {
    pendingDeletePlan.value = plan;
    deletePlanOpen.value = true;
  };

  const confirmDeletePlan = async () => {
    const plan = pendingDeletePlan.value;
    if (!plan) return;
    plugin.settings.syncPlans = plugin.settings.syncPlans.filter(item => item.id !== plan.id);
    if (plugin.settings.defaultSyncPlanId === plan.id) plugin.settings.defaultSyncPlanId = '';
    await plugin.saveSettings();
    touchSettings();
    deletePlanOpen.value = false;
    pendingDeletePlan.value = null;
    new Notice(t('syncPage.planDeleted'));
  };

  const clearDefaultPlan = async () => {
    plugin.settings.defaultSyncPlanId = '';
    await plugin.saveSettings();
    touchSettings();
    new Notice(t('syncPage.planCleared'));
  };

  const openHistoryItem = (id?: string) => {
    if (!id) return;
    const item = plugin.settings.syncHistory.find(history => history.id === id);
    if (!item) return;
    direction.value = item.direction;
    selectedSyncHistory.value = item;
    result.value = {
      created: item.created,
      updated: item.updated,
      skipped: item.skipped,
      failed: item.failed,
      items: (item.syncItems?.length
        ? item.syncItems
        : (item.itemTitles || []).map(title => ({
            title,
            target: item.targetLabel,
            status: 'created' as const,
          }))
      ).map(detail => ({
        title: detail.title,
        source: item.sourceLabel,
        target: detail.target,
        status: detail.status,
      })),
    };
  };

  watch(
    () => props.historyToken,
    () => openHistoryItem(props.historyItemId),
    {immediate: true},
  );
</script>

<template>
  <section class="wm-page wm-sync-page">
    <header class="wm-page-header">
      <div class="wm-title-line">
        <ArrowPathIcon class="wm-title-icon" />
        <h2>{{ t('syncPage.title') }}</h2>
      </div>
      <div class="wm-toolbar">
        <WmTooltip :content="t('syncPage.history')">
          <button class="wm-icon-button" type="button" @click="emit('openHistory')">
            <ClockIcon class="wm-icon" />
          </button>
        </WmTooltip>
        <WmTooltip :content="t('syncPage.refresh')">
          <button class="wm-icon-button" type="button" :disabled="loading" @click="refresh">
            <ArrowPathIcon class="wm-icon" />
          </button>
        </WmTooltip>
      </div>
    </header>

    <div class="wm-sync-stats">
      <section class="wm-panel wm-sync-stat-card">
        <h3>{{ t('syncPage.obsidianVault') }}</h3>
        <strong>{{ stats.obsidian }}</strong
        ><span>{{
          t('syncPage.notesCount', {count: stats.obsidian})
            .replace(String(stats.obsidian), '')
            .trim()
        }}</span>
      </section>
      <section class="wm-panel wm-sync-stat-card is-wide">
        <h3>{{ t('syncPage.wiseMindLocalDataMarkdown') }}</h3>
        <div>
          <span
            ><strong>{{ stats.notes }}</strong
            >{{
              t('syncPage.notesCount', {count: stats.notes}).replace(String(stats.notes), '').trim()
            }}</span
          >
          <span
            ><strong>{{ stats.documents }}</strong
            >{{
              t('syncPage.documentsCount', {count: stats.documents})
                .replace(String(stats.documents), '')
                .trim()
            }}</span
          >
          <span
            ><strong>{{ stats.knowledge }}</strong
            >{{
              t('syncPage.knowledgeBasesCount', {count: stats.knowledge})
                .replace(String(stats.knowledge), '')
                .trim()
            }}</span
          >
        </div>
      </section>
    </div>

    <section class="wm-sync-workspace-notice">
      <CheckCircleIcon class="wm-icon" />
      <div>
        <strong>{{ wiseMindWorkspaceScopeText }}</strong>
        <p>{{ t('syncPage.workspaceScopeDesc') }}</p>
      </div>
    </section>

    <ToggleGroupRoot
      :model-value="direction"
      class="wm-sync-direction"
      type="single"
      @update:model-value="setDirection"
    >
      <ToggleGroupItem value="to-wisemind">
        <ArrowPathIcon class="wm-icon" />
        {{ t('syncPage.toWiseMindDirection') }}
      </ToggleGroupItem>
      <ToggleGroupItem value="to-obsidian">
        <ArrowPathIcon class="wm-icon" />
        {{ t('syncPage.toObsidianDirection') }}
      </ToggleGroupItem>
    </ToggleGroupRoot>

    <section class="wm-panel wm-sync-plan-bar">
      <div class="wm-sync-plan-title">
        <div class="wm-section-title">{{ t('syncPage.syncPlan') }}</div>
      </div>
      <div class="wm-sync-plan-controls">
        <p class="wm:text-xs">{{
          activePlanName
            ? t('syncPage.currentPlan', {name: activePlanName})
            : t('syncPage.planHint')
        }}</p>
        <div class="wm-actions">
          <button class="wm-button" type="button" @click="planPickerOpen = true">
            <BookmarkSquareIcon class="wm-icon" />
            {{ t('syncPage.choosePlan') }}
          </button>
          <button class="wm-button" type="button" @click="openSavePlanDialog">
            <PlusIcon class="wm-icon" />
            {{ t('syncPage.saveNewPlan') }}
          </button>
          <button v-if="activePlanName" class="wm-button" type="button" @click="clearDefaultPlan">
            {{ t('syncPage.clearPlan') }}
          </button>
        </div>
      </div>
    </section>

    <div class="wm-sync-hint">
      <p>{{ selectedHint }}</p>
      <div class="wm-sync-footer">
        <label v-if="direction === 'to-wisemind'">
          <input v-model="overwriteExisting" type="checkbox" />
          {{ t('syncPage.overwriteExisting') }}
        </label>
        <label v-else>
          <input v-model="includeFolderStructure" type="checkbox" />
          {{ t('syncPage.includeFolderStructure') }}
        </label>
        <button
          class="wm-button is-primary"
          type="button"
          :disabled="running || loading"
          @click="prepareExecute"
        >
          <span v-if="running" class="wm-loading-spinner"></span>
          <ArrowPathIcon v-else class="wm-icon" />
          {{ running ? t('syncPage.syncing') : t('syncPage.execute') }}
        </button>
      </div>
    </div>

    <div v-if="direction === 'to-wisemind'" class="wm-sync-flow">
      <section class="wm-sync-list-card">
        <header>
          <div>
            <h3>{{ t('syncPage.obsidianVault') }}</h3>
            <p>{{ t('syncPage.chooseMarkdown') }}</p>
          </div>
          <span>{{ t('syncPage.selectedNotesShort', {count: selectedObsidian.size}) }}</span>
          <div class="wm-sync-header-actions">
            <button class="wm-button" type="button" @click="selectAllObsidian">{{
              t('syncPage.selectAll')
            }}</button>
            <button class="wm-button" type="button" @click="clearAllObsidian">{{
              t('syncPage.clearAll')
            }}</button>
          </div>
        </header>
        <input v-model="searchObsidian" class="wm-input" :placeholder="t('syncPage.searchNotes')" />
        <div class="wm-sync-list wm:p-2">
          <article v-for="group in obsidianGroups" :key="group.id" class="wm-sync-tree-group">
            <button class="wm-sync-tree-header" type="button" @click="toggleExpanded(group.id)">
              <component
                :is="expandedGroups.has(group.id) ? ChevronDownIcon : ChevronRightIcon"
                class="wm-icon"
              />
              <input
                type="checkbox"
                :checked="group.items.every(item => selectedObsidian.has(item.path))"
                @click.stop
                @change="toggleObsidianGroup(group.items)"
              />
              <strong>{{ group.title }}</strong>
              <span>{{
                selectedGroupLabel(group.items, selectedObsidian, item => item.path)
              }}</span>
            </button>
            <div v-if="expandedGroups.has(group.id)" class="wm-sync-tree-children">
              <label v-for="item in group.items" :key="item.path" class="wm-sync-row">
                <input
                  type="checkbox"
                  :checked="selectedObsidian.has(item.path)"
                  @change="
                    toggleObsidianItem(item.path, ($event.target as HTMLInputElement).checked)
                  "
                />
                <span>{{ item.title }}</span>
                <small>{{ item.path }}</small>
              </label>
            </div>
          </article>
        </div>
      </section>

      <ArrowRightIcon class="wm-sync-arrow" />

      <section class="wm-sync-list-card">
        <header>
          <div>
            <h3>{{ t('syncPage.saveToWiseMind') }}</h3>
            <p>{{ t('syncPage.chooseTarget') }}</p>
          </div>
          <span>{{ t('syncPage.selectedTargets', {count: selectedDestinations.size}) }}</span>
          <div class="wm-sync-header-actions">
            <button class="wm-button" type="button" @click="selectAllDestinations">{{
              t('syncPage.selectAll')
            }}</button>
            <button class="wm-button" type="button" @click="clearAllDestinations">{{
              t('syncPage.clearAll')
            }}</button>
          </div>
        </header>
        <input
          v-model="searchDestination"
          class="wm-input"
          :placeholder="t('syncPage.searchTarget')"
        />
        <div v-if="connectionError" class="wm-sync-empty">{{ connectionError }}</div>
        <div v-else class="wm-sync-list wm:p-2">
          <article v-for="group in destinationGroups" :key="group.id" class="wm-sync-tree-group">
            <button class="wm-sync-tree-header" type="button" @click="toggleExpanded(group.id)">
              <component
                :is="expandedGroups.has(group.id) ? ChevronDownIcon : ChevronRightIcon"
                class="wm-icon"
              />
              <FolderIcon class="wm-icon" />
              <strong>{{ group.title }}</strong>
              <span>{{ group.subtitle }}</span>
            </button>
            <div v-if="expandedGroups.has(group.id)" class="wm-sync-tree-children">
              <label v-for="item in group.items" :key="item.key" class="wm-sync-row">
                <input
                  type="checkbox"
                  :checked="selectedDestinations.has(item.key)"
                  @change="
                    toggleDestinationItem(item.key, ($event.target as HTMLInputElement).checked)
                  "
                />
                <span>{{ item.title }}</span>
                <small>{{ item.meta }}</small>
              </label>
            </div>
          </article>
        </div>
      </section>
    </div>

    <div v-else class="wm-sync-flow">
      <section class="wm-sync-list-card">
        <header>
          <div>
            <h3>{{ t('syncPage.wiseMindLocalData') }}</h3>
            <p>{{ t('syncPage.chooseWriteBackContent') }}</p>
          </div>
          <span>{{
            t('syncPage.selectedItems', {count: selectedWiseMindForActiveCategory.length})
          }}</span>
          <div class="wm-sync-header-actions">
            <button class="wm-button" type="button" @click="selectAllWiseMind">{{
              t('syncPage.selectAll')
            }}</button>
            <button class="wm-button" type="button" @click="clearAllWiseMind">{{
              t('syncPage.clearAll')
            }}</button>
          </div>
        </header>
        <input
          v-model="searchWiseMind"
          class="wm-input"
          :placeholder="t('syncPage.searchContent')"
        />
        <div class="wm-sync-category-tabs">
          <button
            :class="{'is-active': activeCategory === 'documents'}"
            type="button"
            @click="activeCategory = 'documents'"
          >
            <DocumentTextIcon class="wm-icon" /> {{ t('syncPage.documents') }}
          </button>
          <button
            :class="{'is-active': activeCategory === 'knowledge'}"
            type="button"
            @click="activeCategory = 'knowledge'"
          >
            <BookmarkSquareIcon class="wm-icon" /> {{ t('syncPage.knowledge') }}
          </button>
          <button
            :class="{'is-active': activeCategory === 'notes'}"
            type="button"
            @click="activeCategory = 'notes'"
          >
            <DocumentTextIcon class="wm-icon" /> {{ t('syncPage.notes') }}
          </button>
        </div>
        <div v-if="connectionError" class="wm-sync-empty">{{ connectionError }}</div>
        <div v-else class="wm-sync-list wm:p-2">
          <div v-if="!wiseMindSourceGroups.length" class="wm-sync-empty">{{
            wiseMindEmptyText
          }}</div>
          <article v-for="group in wiseMindSourceGroups" :key="group.id" class="wm-sync-tree-group">
            <button class="wm-sync-tree-header" type="button" @click="toggleExpanded(group.id)">
              <component
                :is="expandedGroups.has(group.id) ? ChevronDownIcon : ChevronRightIcon"
                class="wm-icon"
              />
              <input
                type="checkbox"
                :checked="group.items.every(item => selectedWiseMind.has(sourceKey(item)))"
                @click.stop
                @change="toggleWiseMindGroup(group.items)"
              />
              <strong>{{ group.title }}</strong>
              <span>{{ selectedGroupLabel(group.items, selectedWiseMind, sourceKey) }}</span>
            </button>
            <div v-if="expandedGroups.has(group.id)" class="wm-sync-tree-children">
              <label v-for="item in group.items" :key="sourceKey(item)" class="wm-sync-row">
                <input
                  type="checkbox"
                  :checked="selectedWiseMind.has(sourceKey(item))"
                  @change="
                    toggleWiseMindItem(sourceKey(item), ($event.target as HTMLInputElement).checked)
                  "
                />
                <span>{{ item.title }}</span>
                <small>{{
                  item.sourceType === 'knowledge-document'
                    ? item.knowledgeBaseName
                    : sourceTypeLabel(item.sourceType)
                }}</small>
              </label>
            </div>
          </article>
        </div>
      </section>

      <ArrowRightIcon class="wm-sync-arrow" />

      <section class="wm-sync-list-card">
        <header>
          <div>
            <h3>{{ t('syncPage.writeToObsidian') }}</h3>
            <p>{{ t('syncPage.chooseTargetFolder') }}</p>
          </div>
          <span>{{ t('syncPage.selectedFolders', {count: selectedObsidianFolders.size}) }}</span>
          <div class="wm-sync-header-actions">
            <button class="wm-button" type="button" @click="selectAllFolders">{{
              t('syncPage.selectAll')
            }}</button>
            <button class="wm-button" type="button" @click="clearAllFolders">{{
              t('syncPage.clearAll')
            }}</button>
          </div>
        </header>
        <input
          v-model="searchObsidianFolder"
          class="wm-input"
          :placeholder="t('syncPage.searchObsidianFolder')"
        />
        <div class="wm-sync-create-row">
          <input
            v-model="newFolderName"
            class="wm-input"
            :placeholder="t('syncPage.newFolderPlaceholder')"
            @keydown.enter.prevent="createObsidianFolder"
          />
          <button class="wm-button" type="button" @click="createObsidianFolder">
            <PlusIcon class="wm-icon" /> {{ t('syncPage.create') }}
          </button>
        </div>
        <div class="wm-sync-list wm:p-2">
          <label v-for="folder in obsidianTargetFolders" :key="folder" class="wm-sync-row">
            <input
              type="checkbox"
              :checked="selectedObsidianFolders.has(folder)"
              @change="toggleFolder(folder, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ folder || t('syncPage.rootFolder') }}</span>
            <small>{{ folder ? t('syncPage.folder') : t('syncPage.vaultRoot') }}</small>
          </label>
        </div>
      </section>
    </div>

    <WiseMindConnectionDialog v-model:open="connectionDialogOpen" />

    <WmDialog
      v-if="pendingSyncPreview"
      v-model:open="previewDialogOpen"
      :title="pendingSyncPreview.title"
      :description="t('syncPage.previewDescription')"
      content-class="wm-sync-preview-dialog"
    >
      <div class="wm-sync-preview-list">
        <div
          v-for="(row, index) in pendingSyncPreview.rows"
          :key="`${row.label}:${row.value}:${index}`"
          class="wm-sync-preview-row"
        >
          <span>{{ row.label }}</span>
          <strong>{{ row.value }}</strong>
        </div>
      </div>
      <div v-if="pendingSyncPreview.warningText" class="wm-sync-warning">
        {{ pendingSyncPreview.warningText }}
      </div>
      <footer class="wm-dialog-actions">
        <button class="wm-button" type="button" @click="previewDialogOpen = false">{{
          t('syncPage.cancel')
        }}</button>
        <button
          class="wm-button is-primary"
          type="button"
          :disabled="running"
          @click="confirmExecute"
        >
          <span v-if="running" class="wm-loading-spinner"></span>
          {{ t('syncPage.confirmSync') }}
        </button>
      </footer>
    </WmDialog>

    <WmDialog
      v-if="result"
      v-model:open="resultDialogOpen"
      :title="t('syncPage.resultTitle')"
      content-class="wm-sync-result-dialog"
    >
      <div class="wm-sync-result-summary">
        <span
          >{{ t('syncPage.created') }} <strong>{{ result.created }}</strong></span
        >
        <span
          >{{ t('syncPage.updated') }} <strong>{{ result.updated }}</strong></span
        >
        <span
          >{{ t('syncPage.skipped') }} <strong>{{ result.skipped }}</strong></span
        >
        <span :class="{'is-error': result.failed}"
          >{{ t('syncPage.failed') }} <strong>{{ result.failed }}</strong></span
        >
      </div>
      <div class="wm-sync-result-groups">
        <section v-for="group in syncResultGroups" :key="group.status" class="wm-sync-result-group">
          <h4>{{ group.label }}（{{ group.rows.length }}）</h4>
          <div class="wm-sync-detail-list">
            <div
              v-for="(item, index) in group.rows"
              :key="`${group.status}:${item.title}:${index}`"
              class="wm-sync-detail-row"
            >
              <strong>{{ item.title }}</strong>
              <ArrowRightIcon class="wm-icon" />
              <span>{{ item.target }}</span>
              <small v-if="item.message">{{ item.message }}</small>
            </div>
          </div>
        </section>
        <div v-if="!syncResultGroups.length" class="wm-sync-empty">{{
          t('syncPage.noSyncDetails')
        }}</div>
      </div>
      <footer class="wm-dialog-actions">
        <button class="wm-button" type="button" @click="resultDialogOpen = false">{{
          t('syncPage.close')
        }}</button>
        <button
          v-if="result.failed"
          class="wm-button is-primary"
          type="button"
          :disabled="running"
          @click="
            resultDialogOpen = false;
            prepareExecute();
          "
        >
          {{ t('syncPage.retry') }}
        </button>
      </footer>
    </WmDialog>

    <section v-if="selectedSyncHistory" class="wm-panel wm-sync-history-preview">
      <div class="wm-panel-title">
        <ClockIcon class="wm-panel-title-icon" />
        <h3>{{ t('syncPage.historyContentTitle') }}</h3>
      </div>
      <p class="wm-muted"
        >{{ selectedSyncHistory.sourceLabel }} -> {{ selectedSyncHistory.targetLabel }}</p
      >
      <div class="wm-sync-detail-list">
        <div
          v-for="(item, index) in selectedSyncHistoryRows"
          :key="`${item.title}:${index}`"
          class="wm-sync-detail-row"
        >
          <strong>{{ item.title }}</strong>
          <ArrowRightIcon class="wm-icon" />
          <span>{{ item.target }}</span>
        </div>
      </div>
    </section>

    <WmDialog
      v-model:open="planPickerOpen"
      :title="t('syncPage.choosePlan')"
      content-class="wm-plan-dialog"
    >
      <div v-if="!sortedPlans.length" class="wm-sync-empty">{{ t('syncPage.noPlans') }}</div>
      <div v-else class="wm-plan-list">
        <article v-for="plan in sortedPlans" :key="plan.id" class="wm-plan-row">
          <div class="wm-plan-row-main">
            <strong>{{ plan.name }}</strong>
            <span>{{
              plan.direction === 'to-wisemind'
                ? t('syncPage.toWiseMindDirection')
                : t('syncPage.toObsidianDirection')
            }}</span>
            <em v-if="plan.id === plugin.settings.defaultSyncPlanId">{{
              t('syncPage.defaultPlan')
            }}</em>
          </div>
          <div class="wm-plan-row-actions">
            <WmTooltip :content="t('syncPage.apply')">
              <button class="wm-icon-button" type="button" @click="applyAndSetDefaultPlan(plan)">
                <CheckCircleIcon class="wm-icon" />
              </button>
            </WmTooltip>
            <WmTooltip :content="t('syncPage.rename')">
              <button class="wm-icon-button" type="button" @click="openRenamePlanDialog(plan)">
                <PencilSquareIcon class="wm-icon" />
              </button>
            </WmTooltip>
            <WmTooltip
              v-if="plan.id !== plugin.settings.defaultSyncPlanId"
              :content="t('syncPage.setDefault')"
            >
              <button class="wm-icon-button" type="button" @click="setDefaultPlan(plan)">
                <BookmarkSquareIcon class="wm-icon" />
              </button>
            </WmTooltip>
            <WmTooltip :content="t('syncPage.delete')">
              <button class="wm-icon-button" type="button" @click="openDeletePlanDialog(plan)">
                <TrashIcon class="wm-icon" />
              </button>
            </WmTooltip>
          </div>
        </article>
      </div>
    </WmDialog>

    <WmDialog
      v-model:open="savePlanOpen"
      :title="t('syncPage.saveNewPlan')"
      content-class="wm-plan-dialog"
    >
      <div class="wm-plan-summary">
        <div v-for="item in currentPlanSummary" :key="item.label" class="wm-plan-summary-row">
          <span>{{ item.label }}</span>
          <div>
            <em v-for="value in item.values.length ? item.values : [item.emptyText]" :key="value">{{
              value
            }}</em>
          </div>
        </div>
      </div>
      <div class="wm-plan-summary-input">
        <span class="title">{{ t('syncPage.planNameLabel') }}</span>
        <input
          v-model="pendingPlanName"
          class="wm-input wm-plan-name-input"
          :placeholder="t('syncPage.planNamePlaceholder')"
          @keydown.enter.prevent="saveCurrentAsPlan"
        />
      </div>
      <footer class="wm-dialog-actions">
        <button class="wm-button" type="button" @click="savePlanOpen = false">{{
          t('syncPage.cancel')
        }}</button>
        <button class="wm-button is-primary" type="button" @click="saveCurrentAsPlan">{{
          t('syncPage.save')
        }}</button>
      </footer>
    </WmDialog>

    <WmDialog
      v-model:open="renamePlanOpen"
      :title="t('syncPage.renamePlanTitle')"
      content-class="wm-plan-dialog"
    >
      <div class="wm-plan-summary-input">
        <span class="title">{{ t('syncPage.planNameLabel') }}</span>
        <input
          v-model="pendingRenamePlanName"
          class="wm-input wm-plan-name-input"
          :placeholder="t('syncPage.planNamePlaceholder')"
          @keydown.enter.prevent="confirmRenamePlan"
        />
      </div>
      <footer class="wm-dialog-actions">
        <button class="wm-button" type="button" @click="renamePlanOpen = false">{{
          t('syncPage.cancel')
        }}</button>
        <button class="wm-button is-primary" type="button" @click="confirmRenamePlan">{{
          t('syncPage.save')
        }}</button>
      </footer>
    </WmDialog>

    <WmDialog
      v-model:open="deletePlanOpen"
      :title="t('syncPage.deletePlanTitle')"
      content-class="wm-plan-dialog"
    >
      <p class="wm-dialog-description">
        {{ t('syncPage.deletePlanConfirm', {name: pendingDeletePlan?.name || ''}) }}
      </p>
      <footer class="wm-dialog-actions">
        <button class="wm-button" type="button" @click="deletePlanOpen = false">{{
          t('syncPage.cancel')
        }}</button>
        <button class="wm-button is-danger" type="button" @click="confirmDeletePlan">{{
          t('syncPage.delete')
        }}</button>
      </footer>
    </WmDialog>
  </section>
</template>
