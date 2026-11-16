import {computed, ref} from 'vue';

import type {SyncHistoryItem, SyncRunResult} from '../../../types';

import type {LastRun, SyncTile} from './types';
import type {SyncCore} from './useSyncCore';

/** The last run (or opened history entry) and the derived tiles, grouped rows and retry count. */
export function useSyncResult(core: SyncCore) {
  const {t, direction, wiseMindWorkspaceScopeText} = core;

  const result = ref<SyncRunResult | null>(null);
  const resultDialogOpen = ref(false);
  const selectedSyncHistory = ref<SyncHistoryItem | null>(null);
  const lastRun = ref<LastRun | null>(null);

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

  const resultTiles = computed<SyncTile[]>(() =>
    result.value
      ? [
          {key: 'created', label: t('syncPage.created'), value: result.value.created, tone: 'is-success'},
          {key: 'updated', label: t('syncPage.updated'), value: result.value.updated, tone: 'is-info'},
          {key: 'skipped', label: t('syncPage.skipped'), value: result.value.skipped, tone: ''},
          {key: 'failed', label: t('syncPage.failed'), value: result.value.failed, tone: 'is-error'},
        ]
      : [],
  );

  const retryableFailedCount = computed(() =>
    selectedSyncHistory.value ? 0 : lastRun.value?.failedSources.length || 0,
  );

  const showHistoryResult = (item: SyncHistoryItem) => {
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

  return {
    result,
    resultDialogOpen,
    selectedSyncHistory,
    lastRun,
    syncResultGroups,
    selectedSyncHistoryRows,
    resultTiles,
    retryableFailedCount,
    showHistoryResult,
  };
}

export type SyncResult = ReturnType<typeof useSyncResult>;
