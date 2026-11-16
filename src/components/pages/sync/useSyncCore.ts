import {computed, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  BookmarkSquareIcon,
  DocumentTextIcon,
  PencilSquareIcon,
} from '@heroicons/vue/24/outline';

import {usePlugin} from '../../../composables/usePlugin';
import {ENABLE_REVERSE_SYNC} from '../../../features';
import type {
  ObsidianSourceItem,
  WiseMindSnapshot,
  WiseMindSourceItem,
  WiseMindWorkspaceState,
} from '../../../types';

import type {Translate} from './syncGrouping';
import type {Direction, SyncView, WiseMindCategory, WizardStep} from './types';

/** Page-wide state every other sync composable builds on: direction, wizard position, loaded data. */
export function useSyncCore() {
  const plugin = usePlugin();
  const {t: i18nT} = useI18n();
  const t: Translate = (key, params) => (params ? i18nT(key, params) : i18nT(key));

  const direction = ref<Direction>('to-wisemind');
  const running = ref(false);
  const loading = ref(false);
  const connectionError = ref('');
  const hasLoadedObsidianItems = ref(false);
  const obsidianItems = ref<ObsidianSourceItem[]>([]);
  const wiseMindItems = ref<WiseMindSourceItem[]>([]);
  const snapshot = ref<WiseMindSnapshot | null>(null);
  const workspaceState = ref<WiseMindWorkspaceState | null>(null);
  const activeCategory = ref<WiseMindCategory>('documents');
  const includeFolderStructure = ref(true);
  const overwriteExisting = ref(plugin.settings.duplicatePolicy === 'update');
  const view = ref<SyncView>('overview');
  const step = ref<WizardStep>(0);
  const settingsRevision = ref(0);
  const initialLoading = computed(() => loading.value && !hasLoadedObsidianItems.value);

  const touchSettings = () => {
    settingsRevision.value += 1;
  };

  const openWizard = (target: WizardStep = 0) => {
    view.value = 'wizard';
    step.value = target;
  };

  const setDirection = (value: unknown) => {
    if (running.value) return;
    if (value === 'to-wisemind' || (value === 'to-obsidian' && ENABLE_REVERSE_SYNC)) direction.value = value;
  };
  const allDirectionOptions = computed(() => [
    {
      value: 'to-wisemind' as const,
      label: t('syncPage.directionShortToWiseMind'),
      title: t('syncPage.toWiseMindDirection'),
      icon: ArrowUpTrayIcon,
    },
    {
      value: 'to-obsidian' as const,
      label: t('syncPage.directionShortToObsidian'),
      title: t('syncPage.toObsidianDirection'),
      icon: ArrowDownTrayIcon,
    },
  ]);
  const directionOptions = computed(() =>
    ENABLE_REVERSE_SYNC ? allDirectionOptions.value : allDirectionOptions.value.filter(item => item.value === 'to-wisemind'),
  );
  const directionLabel = (value: Direction) =>
    value === 'to-wisemind' ? t('syncPage.toWiseMindDirection') : t('syncPage.toObsidianDirection');

  const categoryOptions = computed(() => [
    {value: 'documents' as const, label: t('syncPage.documents'), icon: DocumentTextIcon},
    {value: 'knowledge' as const, label: t('syncPage.knowledge'), icon: BookmarkSquareIcon},
    {value: 'notes' as const, label: t('syncPage.notes'), icon: PencilSquareIcon},
  ]);
  const currentWiseMindWorkspaceName = computed(() => {
    const activeId = plugin.settings.workspaceId || workspaceState.value?.activeWorkspaceId;
    if (!activeId) return t('syncPage.noWorkspace');
    return workspaceState.value?.workspaces.find(item => item.id === activeId)?.name || activeId;
  });
  const wiseMindWorkspaceScopeText = computed(() =>
    t('syncPage.currentWorkspaceScope', {name: currentWiseMindWorkspaceName.value}),
  );

  return {
    plugin,
    t,
    direction,
    running,
    loading,
    connectionError,
    hasLoadedObsidianItems,
    obsidianItems,
    wiseMindItems,
    snapshot,
    workspaceState,
    activeCategory,
    includeFolderStructure,
    overwriteExisting,
    view,
    step,
    settingsRevision,
    initialLoading,
    touchSettings,
    openWizard,
    setDirection,
    directionOptions,
    directionLabel,
    categoryOptions,
    wiseMindWorkspaceScopeText,
  };
}

export type SyncCore = ReturnType<typeof useSyncCore>;
