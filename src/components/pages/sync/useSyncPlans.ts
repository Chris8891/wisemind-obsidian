import {computed, ref} from 'vue';
import {Menu, Notice} from 'obsidian';

import {ENABLE_REVERSE_SYNC} from '../../../features';
import type {SyncPlan} from '../../../types';

import {getDefaultDestinationKeys, getFullySelectedGroupIds, sourceKey} from './syncGrouping';
import type {SyncCore} from './useSyncCore';
import type {SyncSelection} from './useSyncSelection';

/** Saved sync plans: list, apply (incl. the default plan on first load), save, rename, delete. */
export function useSyncPlans(core: SyncCore, selection: SyncSelection) {
  const {plugin, t, direction, activeCategory, snapshot, settingsRevision, touchSettings} = core;
  const {
    selectedObsidian,
    selectedWiseMind,
    selectedDestinations,
    selectedObsidianFolders,
    obsidianGroups,
    wiseMindSourceGroups,
  } = selection;

  const savePlanOpen = ref(false);
  const renamePlanOpen = ref(false);
  const deletePlanOpen = ref(false);
  const pendingPlanName = ref('');
  const pendingRenamePlanName = ref('');
  const pendingRenamePlan = ref<SyncPlan | null>(null);
  const pendingDeletePlan = ref<SyncPlan | null>(null);

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
    if (plan.direction === 'to-obsidian' && !ENABLE_REVERSE_SYNC) return;
    direction.value = plan.direction;
    activeCategory.value = plan.wiseMindCategory || 'documents';
    selectedDestinations.value = new Set(
      plan.wiseMindDestinationKeys?.length
        ? plan.wiseMindDestinationKeys
        : getDefaultDestinationKeys(
            t,
            snapshot.value,
            plugin.settings.contextMenuDefaults.knowledgeBaseName,
          ),
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
      core.obsidianItems.value.filter(item => obsidianPaths.has(item.path)).map(item => item.path),
    );

    const wiseMindKeys = new Set(plan.wiseMindKeys || []);
    wiseMindSourceGroups.value.forEach(group => {
      if ((plan.wiseMindGroupIds || []).includes(group.id)) {
        group.items.forEach(item => wiseMindKeys.add(sourceKey(item)));
      }
    });
    selectedWiseMind.value = new Set(
      core.wiseMindItems.value.filter(item => wiseMindKeys.has(sourceKey(item))).map(sourceKey),
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
    new Notice(t('syncPage.planApplied', {name: plan.name}));
  };

  const applyPlanAndReview = async (plan: SyncPlan) => {
    await applyAndSetDefaultPlan(plan);
    core.openWizard(2);
  };

  const planMeta = (plan: SyncPlan) =>
    [
      core.directionLabel(plan.direction),
      plan.direction === 'to-wisemind'
        ? t('syncPage.obsidianNoteCount', {count: plan.obsidianPaths?.length || 0})
        : t('syncPage.wiseMindContentCount', {count: plan.wiseMindKeys?.length || 0}),
    ].join(' · ');

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

  const clearDefaultPlan = async () => {
    plugin.settings.defaultSyncPlanId = '';
    await plugin.saveSettings();
    touchSettings();
    new Notice(t('syncPage.planCleared'));
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

  const openPlanMenu = (event: MouseEvent, plan: SyncPlan) => {
    const isDefault = plan.id === plugin.settings.defaultSyncPlanId;
    const menu = new Menu().addItem(item =>
      item
        .setTitle(t('syncPage.rename'))
        .setIcon('pencil')
        .onClick(() => openRenamePlanDialog(plan)),
    );
    if (isDefault)
      menu.addItem(item =>
        item
          .setTitle(t('syncPage.clearPlan'))
          .setIcon('bookmark-minus')
          .onClick(() => void clearDefaultPlan()),
      );
    else
      menu.addItem(item =>
        item
          .setTitle(t('syncPage.setDefault'))
          .setIcon('bookmark')
          .onClick(() => void setDefaultPlan(plan)),
      );
    menu
      .addSeparator()
      .addItem(item =>
        item
          .setTitle(t('syncPage.delete'))
          .setIcon('trash')
          .onClick(() => openDeletePlanDialog(plan)),
      )
      .showAtMouseEvent(event);
  };

  return {
    savePlanOpen,
    renamePlanOpen,
    deletePlanOpen,
    pendingPlanName,
    pendingRenamePlanName,
    pendingDeletePlan,
    sortedPlans,
    applyDefaultPlan,
    openSavePlanDialog,
    saveCurrentAsPlan,
    applyPlanAndReview,
    planMeta,
    confirmRenamePlan,
    confirmDeletePlan,
    openPlanMenu,
  };
}

export type SyncPlans = ReturnType<typeof useSyncPlans>;
