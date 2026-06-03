<script setup lang="ts">
  import {computed, nextTick, onMounted, ref, watch} from 'vue';
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
  } from '../../types';
  import {scanVault} from '../../vaultScanner';
  import {loadWiseMindSources, resolveFolderPath} from '../../wisemindSourceScanner';
  import {runWiseMindToObsidianImport} from '../../wisemindToObsidianRunner';
  import WiseMindConnectionDialog from '../WiseMindConnectionDialog.vue';
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
  const selectedObsidian = ref(new Set<string>());
  const selectedWiseMind = ref(new Set<string>());
  const selectedDestinations = ref(new Set<string>());
  const selectedObsidianFolders = ref(new Set<string>());
  const expandedGroups = ref(
    new Set<string>([
      'obsidian:root',
      'dest:documents',
      'target:root',
      'wisemind:documents:根目录',
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
  const pendingPlanName = ref('');
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

  const selectedHint = computed(() => {
    if (direction.value === 'to-wisemind') {
      return `已选 ${selectedObsidian.value.size} 篇 Obsidian 笔记，目标：${selectedDestinations.value.size} 个目标`;
    }
    return `已选 ${selectedWiseMindForActiveCategory.value.length} 条 WiseMindAI 内容，目标：${selectedObsidianFolders.value.size} 个文件夹`;
  });

  const selectedWiseMindForActiveCategory = computed(() =>
    wiseMindItems.value.filter(
      item =>
        selectedWiseMind.value.has(sourceKey(item)) &&
        sourceMatchesCategory(item, activeCategory.value),
    ),
  );

  const fallbackSyncTarget = (history: SyncHistoryItem | null) =>
    history?.targetLabel || (direction.value === 'to-wisemind' ? 'WiseMindAI' : 'Obsidian');

  const syncResultRows = computed(() =>
    (result.value?.items || []).map(item => ({
      title: item.title,
      target: item.target || fallbackSyncTarget(selectedSyncHistory.value),
      status: item.status,
      message: item.message || '',
    })),
  );
  const syncStatusLabels = {
    created: '新建',
    updated: '更新',
    skipped: '跳过',
    failed: '失败',
  } as const;
  const syncStatusBadgeClass = {
    created: 'badge-success',
    updated: 'badge-info',
    skipped: 'badge-ghost',
    failed: 'badge-error',
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
      matchesSearch(folder || '根目录', searchObsidianFolder.value),
    ),
  );
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
      label: '同步方向',
      values: [
        direction.value === 'to-wisemind' ? 'Obsidian -> WiseMindAI' : 'WiseMindAI -> Obsidian',
      ],
      emptyText: '',
    },
    {
      label: direction.value === 'to-wisemind' ? '已选择的内容' : '已选择的 WiseMindAI 内容',
      values: [
        direction.value === 'to-wisemind'
          ? `${selectedObsidian.value.size} 篇 Obsidian 笔记`
          : `${selectedWiseMindForActiveCategory.value.length} 条内容`,
      ],
      emptyText: '未选择内容',
    },
    {
      label: '来源文件夹',
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
      emptyText: '未完整选择文件夹',
    },
    {
      label: direction.value === 'to-wisemind' ? '保存到' : '写入 Obsidian',
      values:
        direction.value === 'to-wisemind'
          ? allDestinations()
              .filter(item => selectedDestinations.value.has(item.key))
              .map(item => item.title)
          : Array.from(selectedObsidianFolders.value).map(folder => folder || '根目录'),
      emptyText: '未选择目标',
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
      new Notice(error?.message || '扫描 Obsidian 仓库失败');
    }

    try {
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
      connectionError.value = error?.message || '无法连接 WiseMindAI 本地接口';
      snapshot.value = null;
      wiseMindItems.value = [];
      selectedWiseMind.value = new Set();
      selectedDestinations.value = new Set();
    } finally {
      loading.value = false;
    }
  };

  const buildCurrentSyncPreview = () =>
    buildSyncPreview({
      direction: direction.value,
      sourceCount:
        direction.value === 'to-wisemind'
          ? selectedObsidian.value.size
          : selectedWiseMindForActiveCategory.value.length,
      targetLabels:
        direction.value === 'to-wisemind'
          ? allDestinations()
              .filter(item => selectedDestinations.value.has(item.key))
              .map(item => `${item.meta}：${item.title}`)
          : Array.from(selectedObsidianFolders.value).map(folder => folder || '根目录'),
      overwriteExisting:
        direction.value === 'to-wisemind'
          ? overwriteExisting.value
          : plugin.settings.duplicatePolicy === 'update',
    });

  const prepareExecute = async () => {
    if (!(await ensureWiseMindConnected())) return;
    if (direction.value === 'to-wisemind') {
      if (!selectedObsidian.value.size) {
        new Notice('请先选择要同步的 Obsidian 笔记');
        return;
      }
      if (!selectedDestinations.value.size) {
        new Notice('请先选择 WiseMindAI 目标');
        return;
      }
    } else {
      if (!selectedWiseMindForActiveCategory.value.length) {
        new Notice('请先选择要写回 Obsidian 的内容');
        return;
      }
      if (!selectedObsidianFolders.value.size) {
        new Notice('请先选择 Obsidian 目标文件夹');
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
          new Notice('请先选择要同步的 Obsidian 笔记');
          return;
        }
        if (!destinations.length) {
          new Notice('请先选择 WiseMindAI 目标');
          return;
        }
        upsertPluginTask({
          id: taskId,
          title: '正在同步到 WiseMindAI',
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
          onProgress: progress =>
            upsertPluginTask({
              id: taskId,
              title: '正在同步到 WiseMindAI',
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
          new Notice('请先选择要写回 Obsidian 的内容');
          return;
        }
        if (!folders.length) {
          new Notice('请先选择 Obsidian 目标文件夹');
          return;
        }
        upsertPluginTask({
          id: taskId,
          title: '正在写回 Obsidian',
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
          onProgress: progress =>
            upsertPluginTask({
              id: taskId,
              title: '正在写回 Obsidian',
              status: 'running',
              total: items.length * Math.max(folders.length, 1),
              completed: progress.items.length,
            }),
        });
      }

      if (result.value) {
        upsertPluginTask({
          id: taskId,
          title: '同步完成',
          status: result.value.failed ? 'failed' : 'completed',
          total: result.value.items.length,
          completed: result.value.items.length,
          message: result.value.failed ? `${result.value.failed} 项失败` : '',
        });
        plugin.settings.syncHistory.unshift({
          id: `sync-${Date.now()}`,
          createdAt: Date.now(),
          direction: direction.value,
          sourceLabel:
            direction.value === 'to-wisemind' ? 'Obsidian 当前仓库' : 'WiseMindAI 本地数据',
          targetLabel: direction.value === 'to-wisemind' ? 'WiseMindAI' : 'Obsidian 当前仓库',
          sourceFolders: [],
          targetFolders:
            direction.value === 'to-obsidian' ? Array.from(selectedObsidianFolders.value) : [],
          itemTitles: result.value.items.map(item => item.title),
          syncItems: result.value.items.map(item => ({
            title: item.title,
            target: item.target || (direction.value === 'to-wisemind' ? 'WiseMindAI' : 'Obsidian'),
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
        new Notice('同步完成');
      }
    } catch (error: any) {
      upsertPluginTask({
        id: taskId,
        title: '同步失败',
        status: 'failed',
        message: error?.message || '同步失败',
      });
      new Notice(error?.message || '同步失败');
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
      new Notice('请输入文件夹名称');
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
    new Notice(`已选择文件夹：${folder}`);
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
    if (value === 'document') return '文档';
    if (value === 'knowledge-document') return '知识库';
    return '笔记';
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
        const folder = item.folderPath || '根目录';
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
            ? item.knowledgeBaseName || '知识库'
            : item.folderPath || '根目录';
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
    const noteFolders = folderDestinations('notes', data.noteFolders || [], '根目录');
    const docFolders = folderDestinations('documents', data.documentFolders || [], '根目录');
    const knowledgeBases = (data.knowledgeBases || []).map((base: any) => ({
      key: `knowledge:${base.name || base.title || base.id}`,
      target: 'knowledge' as const,
      value: String(base.name || base.title || base.id || ''),
      title: String(base.name || base.title || `knowledge-${base.id}`),
      meta: '知识库',
    }));
    return [
      {
        id: 'dest:notes',
        title: '笔记',
        subtitle: `${noteFolders.length} 个文件夹`,
        items: noteFolders,
      },
      {
        id: 'dest:documents',
        title: '文档',
        subtitle: `${docFolders.length} 个文件夹`,
        items: docFolders,
      },
      {
        id: 'dest:knowledge',
        title: '知识库',
        subtitle: `${knowledgeBases.length} 个知识库`,
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
    {key: `${target}:`, target, value: '', title: rootTitle, meta: '根目录'},
    ...folders.map(folder => {
      const path = resolveFolderPath(folder.id, folders) || folder.name;
      return {
        key: `${target}:${path}`,
        target,
        value: path,
        title: path,
        meta: '文件夹',
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
    pendingPlanName.value = activePlanName.value || '我的同步方案';
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
    new Notice('同步方案已保存');
  };

  const applyAndSetDefaultPlan = async (plan: SyncPlan) => {
    applyPlan(plan);
    plugin.settings.defaultSyncPlanId = plan.id;
    await plugin.saveSettings();
    touchSettings();
    planPickerOpen.value = false;
    new Notice(`已套用同步方案：${plan.name}`);
  };

  const renamePlan = async (plan: SyncPlan) => {
    const name = window.prompt('输入新的方案名称', plan.name)?.trim();
    if (!name) return;
    plan.name = name;
    plan.updatedAt = Date.now();
    await plugin.saveSettings();
    touchSettings();
    new Notice('同步方案已重命名');
  };

  const setDefaultPlan = async (plan: SyncPlan) => {
    plugin.settings.defaultSyncPlanId = plan.id;
    await plugin.saveSettings();
    touchSettings();
    new Notice('已设置为默认同步方案');
  };

  const deletePlan = async (plan: SyncPlan) => {
    if (!window.confirm(`确定删除同步方案「${plan.name}」吗？`)) return;
    plugin.settings.syncPlans = plugin.settings.syncPlans.filter(item => item.id !== plan.id);
    if (plugin.settings.defaultSyncPlanId === plan.id) plugin.settings.defaultSyncPlanId = '';
    await plugin.saveSettings();
    touchSettings();
    new Notice('同步方案已删除');
  };

  const clearDefaultPlan = async () => {
    plugin.settings.defaultSyncPlanId = '';
    await plugin.saveSettings();
    touchSettings();
    new Notice('已取消选中同步方案');
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
        <h2>数据同步</h2>
      </div>
      <div class="wm-toolbar">
        <WmTooltip content="历史记录">
          <button class="wm-icon-button" type="button" @click="emit('openHistory')">
            <ClockIcon class="wm-icon" />
          </button>
        </WmTooltip>
        <WmTooltip content="刷新">
          <button class="wm-icon-button" type="button" :disabled="loading" @click="refresh">
            <ArrowPathIcon class="wm-icon" />
          </button>
        </WmTooltip>
      </div>
    </header>

    <div class="wm-sync-stats">
      <section class="wm-panel wm-sync-stat-card">
        <h3>Obsidian 当前仓库</h3>
        <strong>{{ stats.obsidian }}</strong
        ><span>篇笔记</span>
      </section>
      <section class="wm-panel wm-sync-stat-card is-wide">
        <h3>WiseMindAI 本地数据（仅 Markdown 文档）</h3>
        <div>
          <span
            ><strong>{{ stats.notes }}</strong
            >篇笔记</span
          >
          <span
            ><strong>{{ stats.documents }}</strong
            >个文档</span
          >
          <span
            ><strong>{{ stats.knowledge }}</strong
            >个知识库</span
          >
        </div>
      </section>
    </div>

    <ToggleGroupRoot
      :model-value="direction"
      class="wm-sync-direction"
      type="single"
      @update:model-value="setDirection"
    >
      <ToggleGroupItem value="to-wisemind">
        <ArrowPathIcon class="wm-icon" />
        Obsidian -> WiseMindAI
      </ToggleGroupItem>
      <ToggleGroupItem value="to-obsidian">
        <ArrowPathIcon class="wm-icon" />
        WiseMindAI -> Obsidian
      </ToggleGroupItem>
    </ToggleGroupRoot>

    <section class="wm-panel wm-sync-plan-bar">
      <div class="wm-sync-plan-title">
        <div class="wm-section-title">同步方案</div>
      </div>
      <div class="wm-sync-plan-controls">
        <p class="wm:text-xs">{{
          activePlanName ? `当前：${activePlanName}` : '可保存当前选择，下次直接套用。'
        }}</p>
        <div class="wm-actions">
          <button class="wm-button" type="button" @click="planPickerOpen = true">
            <BookmarkSquareIcon class="wm-icon" />
            选择方案
          </button>
          <button class="wm-button" type="button" @click="openSavePlanDialog">
            <PlusIcon class="wm-icon" />
            保存新方案
          </button>
          <button v-if="activePlanName" class="wm-button" type="button" @click="clearDefaultPlan">
            取消选中方案
          </button>
        </div>
      </div>
    </section>

    <p class="wm-sync-hint">{{ selectedHint }}</p>

    <div v-if="direction === 'to-wisemind'" class="wm-sync-flow">
      <section class="wm-sync-list-card">
        <header>
          <div>
            <h3>Obsidian 当前仓库</h3>
            <p>选择要发送的 Markdown</p>
          </div>
          <span>已选 {{ selectedObsidian.size }} 篇</span>
          <div class="wm-sync-header-actions">
            <button class="wm-button" type="button" @click="selectAllObsidian">全选</button>
            <button class="wm-button" type="button" @click="clearAllObsidian">清空</button>
          </div>
        </header>
        <input v-model="searchObsidian" class="wm-input" placeholder="搜索文件夹或笔记" />
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
              <span
                >已选 {{ group.items.filter(item => selectedObsidian.has(item.path)).length }}/{{
                  group.items.length
                }}</span
              >
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
            <h3>保存到 WiseMindAI</h3>
            <p>选择目标文件夹或知识库</p>
          </div>
          <span>已选 {{ selectedDestinations.size }} 个目标</span>
          <div class="wm-sync-header-actions">
            <button class="wm-button" type="button" @click="selectAllDestinations">全选</button>
            <button class="wm-button" type="button" @click="clearAllDestinations">清空</button>
          </div>
        </header>
        <input v-model="searchDestination" class="wm-input" placeholder="搜索目标" />
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
            <h3>WiseMindAI 本地数据</h3>
            <p>选择要写回的内容</p>
          </div>
          <span>已选 {{ selectedWiseMindForActiveCategory.length }} 个</span>
          <div class="wm-sync-header-actions">
            <button class="wm-button" type="button" @click="selectAllWiseMind">全选</button>
            <button class="wm-button" type="button" @click="clearAllWiseMind">清空</button>
          </div>
        </header>
        <input v-model="searchWiseMind" class="wm-input" placeholder="搜索内容" />
        <div class="wm-sync-category-tabs">
          <button
            :class="{'is-active': activeCategory === 'documents'}"
            type="button"
            @click="activeCategory = 'documents'"
          >
            <DocumentTextIcon class="wm-icon" /> 文档
          </button>
          <button
            :class="{'is-active': activeCategory === 'knowledge'}"
            type="button"
            @click="activeCategory = 'knowledge'"
          >
            <BookmarkSquareIcon class="wm-icon" /> 知识库
          </button>
          <button
            :class="{'is-active': activeCategory === 'notes'}"
            type="button"
            @click="activeCategory = 'notes'"
          >
            <DocumentTextIcon class="wm-icon" /> 笔记
          </button>
        </div>
        <div v-if="connectionError" class="wm-sync-empty">{{ connectionError }}</div>
        <div v-else class="wm-sync-list wm:p-2">
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
              <span
                >已选
                {{ group.items.filter(item => selectedWiseMind.has(sourceKey(item))).length }}/{{
                  group.items.length
                }}</span
              >
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
            <h3>写入 Obsidian</h3>
            <p>选择目标文件夹</p>
          </div>
          <span>已选 {{ selectedObsidianFolders.size }} 个文件夹</span>
          <div class="wm-sync-header-actions">
            <button class="wm-button" type="button" @click="selectAllFolders">全选</button>
            <button class="wm-button" type="button" @click="clearAllFolders">清空</button>
          </div>
        </header>
        <input v-model="searchObsidianFolder" class="wm-input" placeholder="搜索 Obsidian 文件夹" />
        <div class="wm-sync-create-row">
          <input
            v-model="newFolderName"
            class="wm-input"
            placeholder="新建文件夹名称"
            @keydown.enter.prevent="createObsidianFolder"
          />
          <button class="wm-button" type="button" @click="createObsidianFolder">
            <PlusIcon class="wm-icon" /> 创建
          </button>
        </div>
        <div class="wm-sync-list wm:p-2">
          <label v-for="folder in obsidianTargetFolders" :key="folder" class="wm-sync-row">
            <input
              type="checkbox"
              :checked="selectedObsidianFolders.has(folder)"
              @change="toggleFolder(folder, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ folder || '根目录' }}</span>
            <small>{{ folder ? '文件夹' : '仓库根目录' }}</small>
          </label>
        </div>
      </section>
    </div>

    <footer class="wm-sync-footer">
      <label v-if="direction === 'to-wisemind'">
        <input v-model="overwriteExisting" type="checkbox" />
        覆盖已有
      </label>
      <label v-else>
        <input v-model="includeFolderStructure" type="checkbox" />
        包含文件夹
      </label>
      <button
        class="wm-button is-primary"
        type="button"
        :disabled="running || loading"
        @click="prepareExecute"
      >
        <span v-if="running" class="wm-loading-spinner"></span>
        <ArrowPathIcon v-else class="wm-icon" />
        {{ running ? '同步中' : '执行同步' }}
      </button>
    </footer>
    <WiseMindConnectionDialog v-model:open="connectionDialogOpen" />

    <div v-if="previewDialogOpen && pendingSyncPreview" class="modal modal-open">
      <section class="modal-box relative" role="dialog" aria-modal="true" aria-label="同步预览">
        <button
          class="btn btn-sm btn-circle btn-ghost absolute right-4 top-4"
          type="button"
          @click="previewDialogOpen = false"
          >✕</button
        >
        <h3 class="text-lg font-bold">{{ pendingSyncPreview.title }}</h3>
        <p class="mt-2 text-sm text-base-content/70">请确认来源数量和目标位置后再执行同步。</p>
        <div class="mt-4 space-y-2">
          <div
            v-for="(row, index) in pendingSyncPreview.rows"
            :key="`${row.label}:${row.value}:${index}`"
            class="flex items-start justify-between gap-4 rounded-box bg-base-200 px-3 py-2 text-sm"
          >
            <span class="text-base-content/60">{{ row.label }}</span>
            <strong class="text-right">{{ row.value }}</strong>
          </div>
        </div>
        <div v-if="pendingSyncPreview.warningText" class="alert alert-warning mt-4">
          <span>{{ pendingSyncPreview.warningText }}</span>
        </div>
        <footer class="modal-action">
          <button class="wm-button" type="button" @click="previewDialogOpen = false">取消</button>
          <button
            class="wm-button is-primary"
            type="button"
            :disabled="running"
            @click="confirmExecute"
          >
            <span v-if="running" class="loading loading-spinner loading-sm"></span>
            确认同步
          </button>
        </footer>
      </section>
    </div>

    <div
      v-if="resultDialogOpen && result"
      class="modal modal-open"
      @click.self="resultDialogOpen = false"
    >
      <section
        class="modal-box relative wm-sync-result-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="同步结果"
      >
        <button
          class="btn btn-sm btn-circle btn-ghost absolute right-4 top-4"
          type="button"
          @click="resultDialogOpen = false"
          >✕</button
        >
        <h3 class="wm-dialog-title">同步明细</h3>
        <p class="wm-muted">
          新建 {{ result.created }} / 更新 {{ result.updated }} / 跳过 {{ result.skipped }} / 失败
          {{ result.failed }}
        </p>
        <div class="space-y-4">
          <section v-for="group in syncResultGroups" :key="group.status" class="space-y-2">
            <h4 class="flex items-center gap-2 text-sm font-semibold">
              <span class="badge" :class="syncStatusBadgeClass[group.status]">{{
                group.label
              }}</span>
              <span>{{ group.rows.length }} 项</span>
            </h4>
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
        </div>
        <footer class="modal-action">
          <button class="wm-button" type="button" @click="resultDialogOpen = false">关闭</button>
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
            重试同步
          </button>
        </footer>
      </section>
    </div>

    <section v-if="selectedSyncHistory" class="wm-panel wm-sync-history-preview">
      <div class="wm-panel-title">
        <ClockIcon class="wm-panel-title-icon" />
        <h3>历史同步内容</h3>
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

    <div v-if="planPickerOpen" class="modal modal-open wm-plan-modal">
      <section
        class="modal-box relative wm-plan-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="选择同步方案"
      >
        <button
          class="btn btn-sm btn-circle btn-ghost absolute right-4 top-4"
          type="button"
          @click="planPickerOpen = false"
          >✕</button
        >
        <h3 class="wm-dialog-title">选择同步方案</h3>
        <div v-if="!sortedPlans.length" class="wm-sync-empty">还没有保存过同步方案。</div>
        <div v-else class="wm-plan-list">
          <article v-for="plan in sortedPlans" :key="plan.id" class="wm-plan-row">
            <div class="wm-plan-row-main">
              <strong>{{ plan.name }}</strong>
              <span>{{
                plan.direction === 'to-wisemind'
                  ? 'Obsidian -> WiseMindAI'
                  : 'WiseMindAI -> Obsidian'
              }}</span>
              <em v-if="plan.id === plugin.settings.defaultSyncPlanId">默认</em>
            </div>
            <div class="wm-plan-row-actions">
              <WmTooltip content="应用">
                <button class="wm-icon-button" type="button" @click="applyAndSetDefaultPlan(plan)">
                  <CheckCircleIcon class="wm-icon" />
                </button>
              </WmTooltip>
              <WmTooltip content="重命名">
                <button class="wm-icon-button" type="button" @click="renamePlan(plan)">
                  <PencilSquareIcon class="wm-icon" />
                </button>
              </WmTooltip>
              <WmTooltip v-if="plan.id !== plugin.settings.defaultSyncPlanId" content="设为默认">
                <button class="wm-icon-button" type="button" @click="setDefaultPlan(plan)">
                  <BookmarkSquareIcon class="wm-icon" />
                </button>
              </WmTooltip>
              <WmTooltip content="删除">
                <button class="wm-icon-button" type="button" @click="deletePlan(plan)">
                  <TrashIcon class="wm-icon" />
                </button>
              </WmTooltip>
            </div>
          </article>
        </div>
      </section>
    </div>

    <div v-if="savePlanOpen" class="modal modal-open wm-plan-modal">
      <section
        class="modal-box relative wm-plan-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="保存新方案"
      >
        <button
          class="btn btn-sm btn-circle btn-ghost absolute right-4 top-4"
          type="button"
          @click="savePlanOpen = false"
          >✕</button
        >
        <h3 class="wm-dialog-title">保存新方案</h3>
        <div class="wm-plan-summary">
          <div v-for="item in currentPlanSummary" :key="item.label" class="wm-plan-summary-row">
            <span>{{ item.label }}</span>
            <div>
              <em
                v-for="value in item.values.length ? item.values : [item.emptyText]"
                :key="value"
                >{{ value }}</em
              >
            </div>
          </div>
        </div>
        <div class="wm-plan-summary-input">
          <span class="title">方案名称：</span>
          <input
            v-model="pendingPlanName"
            class="wm-input wm-plan-name-input"
            placeholder="方案名称"
            @keydown.enter.prevent="saveCurrentAsPlan"
          />
        </div>
        <footer class="wm-dialog-actions">
          <button class="wm-button" type="button" @click="savePlanOpen = false">取消</button>
          <button class="wm-button is-primary" type="button" @click="saveCurrentAsPlan"
            >保存</button
          >
        </footer>
      </section>
    </div>
  </section>
</template>
