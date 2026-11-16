import {computed, nextTick, ref} from 'vue';
import {Notice} from 'obsidian';

import {useWiseMindConnectionGuard} from '../../../composables/useWiseMindConnectionGuard';
import {upsertPluginTask} from '../../../services/pluginTaskProgress';
import type {SyncPreview} from '../../../services/syncPreview';
import type {SyncRunResult} from '../../../types';
import {hydrateObsidianItems} from '../../../vaultScanner';

import {sourceKey} from './syncGrouping';
import {recordSyncHistory, runToObsidian, runToWiseMind} from './syncRunTasks';
import type {WizardStep} from './types';
import type {SyncCore} from './useSyncCore';
import type {SyncResult} from './useSyncResult';
import type {SyncSelection} from './useSyncSelection';
import type {SyncSummary} from './useSyncSummary';

/** Running a sync: preview confirmation, execution with progress, retry of failed items, wizard flow. */
export function useSyncRun(
  core: SyncCore,
  selection: SyncSelection,
  summary: SyncSummary,
  syncResult: SyncResult,
) {
  const {plugin, t, direction, running, view, step, activeCategory} = core;
  const {result, resultDialogOpen, selectedSyncHistory, lastRun} = syncResult;
  const {connectionDialogOpen, ensureWiseMindConnected} = useWiseMindConnectionGuard();

  const previewDialogOpen = ref(false);
  const pendingSyncPreview = ref<SyncPreview | null>(null);
  const runProgress = ref({completed: 0, total: 0});
  const runPercent = computed(() => {
    const {completed, total} = runProgress.value;
    return total ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  });
  const trackProgress = (completed: number, total: number) => {
    runProgress.value = {completed, total};
  };

  const finishRun = async (
    taskId: string,
    value: SyncRunResult,
    run: Parameters<typeof recordSyncHistory>[3] & {category: typeof activeCategory.value},
  ) => {
    selectedSyncHistory.value = null;
    lastRun.value = {
      direction: run.direction,
      category: run.category,
      failedSources: Array.from(
        new Set(value.items.filter(item => item.status === 'failed').map(item => item.source)),
      ).filter(Boolean),
    };
    upsertPluginTask({
      id: taskId,
      title: t('syncPage.taskCompleted'),
      status: value.failed ? 'failed' : 'completed',
      total: value.items.length,
      completed: value.items.length,
      message: value.failed ? t('syncPage.failedCount', {count: value.failed}) : '',
    });
    recordSyncHistory(plugin, t, value, run);
    await plugin.saveSettings();
    core.touchSettings();
    await nextTick();
    resultDialogOpen.value = true;
  };

  const executeConfirmed = async () => {
    const taskId = `sync-${Date.now()}`;
    // Snapshot the run inputs: plans or history can change the page state while the sync awaits.
    const run = {
      direction: direction.value,
      scopeText: core.wiseMindWorkspaceScopeText.value,
      targetFolders: Array.from(selection.selectedObsidianFolders.value),
      category: activeCategory.value,
    };
    running.value = true;
    trackProgress(0, 0);
    result.value = null;
    resultDialogOpen.value = false;
    selectedSyncHistory.value = null;
    try {
      plugin.settings.duplicatePolicy = core.overwriteExisting.value ? 'update' : 'skip';
      await plugin.saveSettings();
      const title =
        run.direction === 'to-wisemind'
          ? t('syncPage.taskSyncToWiseMind')
          : t('syncPage.taskWriteToObsidian');
      const report = (completed: number, total: number) => {
        trackProgress(completed, total);
        upsertPluginTask({id: taskId, title, status: 'running', total, completed});
      };
      if (run.direction === 'to-wisemind') {
        const selected = core.obsidianItems.value.filter(item =>
          selection.selectedObsidian.value.has(item.path),
        );
        // Overview only keeps metadata; read bodies now for the selected set.
        const items = await hydrateObsidianItems(plugin.app, selected);
        const destinations = selection
          .allDestinations()
          .filter(item => selection.selectedDestinations.value.has(item.key));
        const value = await runToWiseMind(plugin, t, items, destinations, report);
        if (!value) return;
        result.value = value;
      } else {
        // Only the active category is counted, previewed and confirmed, so only it is written.
        const items = selection.selectedWiseMindForActiveCategory.value;
        const value = await runToObsidian(
          plugin,
          t,
          items,
          run.targetFolders,
          core.includeFolderStructure.value,
          report,
        );
        if (!value) return;
        result.value = value;
      }

      if (result.value) await finishRun(taskId, result.value, run);
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

  const prepareExecute = async () => {
    if (!(await ensureWiseMindConnected())) return;
    if (!summary.validateSource() || !summary.validateTarget()) return;
    pendingSyncPreview.value = summary.buildCurrentSyncPreview();
    previewDialogOpen.value = true;
  };

  const confirmExecute = async () => {
    previewDialogOpen.value = false;
    await executeConfirmed();
  };

  const retryFromResult = () => {
    resultDialogOpen.value = false;
    void prepareExecute();
  };

  // Narrows the selection to the sources that failed in the last run and reopens the preview.
  const retryFailed = () => {
    const last = lastRun.value;
    if (!last?.failedSources.length || running.value) return;
    const sources = new Set(last.failedSources);
    direction.value = last.direction;
    if (last.direction === 'to-wisemind') {
      selection.selectedObsidian.value = new Set(
        core.obsidianItems.value.filter(item => sources.has(item.path)).map(item => item.path),
      );
    } else {
      activeCategory.value = last.category;
      selection.selectedWiseMind.value = new Set(
        core.wiseMindItems.value.map(sourceKey).filter(key => sources.has(key)),
      );
    }
    resultDialogOpen.value = false;
    void prepareExecute();
  };

  const goToStep = (index: number) => {
    if (running.value) return;
    if (index < step.value) step.value = index as WizardStep;
  };

  const goNext = () => {
    if (step.value === 0 && !summary.validateSource()) return;
    if (step.value === 1 && !summary.validateTarget()) return;
    if (step.value < 2) step.value = (step.value + 1) as WizardStep;
  };

  const goBack = () => {
    if (step.value === 0) view.value = 'overview';
    else step.value = (step.value - 1) as WizardStep;
  };

  const runFromWizard = async () => {
    if (!(await ensureWiseMindConnected())) return;
    if (!summary.validateSource() || !summary.validateTarget()) return;
    await executeConfirmed();
    if (result.value) {
      view.value = 'overview';
      step.value = 0;
    }
  };

  const openHistoryItem = (id?: string) => {
    if (!id) return;
    const item = plugin.settings.syncHistory.find(history => history.id === id);
    if (!item) return;
    direction.value = item.direction;
    view.value = 'overview';
    step.value = 0;
    previewDialogOpen.value = false;
    resultDialogOpen.value = false;
    syncResult.showHistoryResult(item);
  };

  return {
    connectionDialogOpen,
    previewDialogOpen,
    pendingSyncPreview,
    runProgress,
    runPercent,
    prepareExecute,
    confirmExecute,
    retryFromResult,
    retryFailed,
    goToStep,
    goNext,
    goBack,
    runFromWizard,
    openHistoryItem,
  };
}

export type SyncRun = ReturnType<typeof useSyncRun>;
