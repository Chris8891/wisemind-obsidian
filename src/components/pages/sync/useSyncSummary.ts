import {computed} from 'vue';
import {Notice} from 'obsidian';

import {buildSyncPreview} from '../../../services/syncPreview';

import {getFullySelectedGroupIds, sourceKey} from './syncGrouping';
import type {SyncTile} from './types';
import type {SyncCore} from './useSyncCore';
import type {SyncSelection} from './useSyncSelection';

/** Counts and human-readable summaries of the current picks, shared by the footer, confirm step and dialogs. */
export function useSyncSummary(core: SyncCore, selection: SyncSelection) {
  const {t, direction, overwriteExisting, wiseMindWorkspaceScopeText} = core;
  const {
    selectedObsidian,
    selectedWiseMind,
    selectedDestinations,
    selectedObsidianFolders,
    selectedWiseMindForActiveCategory,
    obsidianGroups,
    wiseMindSourceGroups,
    allDestinations,
  } = selection;

  const isToWiseMind = () => direction.value === 'to-wisemind';

  const sourceCount = computed(() =>
    isToWiseMind() ? selectedObsidian.value.size : selectedWiseMindForActiveCategory.value.length,
  );
  const targetCount = computed(() =>
    isToWiseMind() ? selectedDestinations.value.size : selectedObsidianFolders.value.size,
  );

  const selectedHint = computed(() => {
    if (isToWiseMind()) {
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

  const fullySelectedSourceFolders = computed(() =>
    isToWiseMind()
      ? getFullySelectedGroupIds(obsidianGroups.value, selectedObsidian.value, item => item.path).map(
          id => id.replace(/^obsidian:/, ''),
        )
      : getFullySelectedGroupIds(wiseMindSourceGroups.value, selectedWiseMind.value, sourceKey).map(
          id => id.split(':').slice(2).join(':'),
        ),
  );

  const selectedTargetTitles = computed(() =>
    isToWiseMind()
      ? allDestinations()
          .filter(item => selectedDestinations.value.has(item.key))
          .map(item => item.title)
      : Array.from(selectedObsidianFolders.value).map(folder => folder || t('syncPage.rootFolder')),
  );

  const sourceCountText = computed(() =>
    isToWiseMind()
      ? t('syncPage.obsidianNoteCount', {count: sourceCount.value})
      : t('syncPage.wiseMindContentCount', {count: sourceCount.value}),
  );
  const targetCountText = computed(() =>
    isToWiseMind()
      ? t('syncPage.selectedTargets', {count: targetCount.value})
      : t('syncPage.selectedFolders', {count: targetCount.value}),
  );
  const targetSummaryText = computed(() =>
    selectedTargetTitles.value.length === 1 ? selectedTargetTitles.value[0] : targetCountText.value,
  );

  const confirmTiles = computed<SyncTile[]>(() => [
    {key: 'content', label: t('syncPage.statContent'), value: sourceCount.value, tone: 'is-success'},
    {key: 'targets', label: t('taskHistory.target'), value: targetCount.value, tone: 'is-info'},
    {key: 'folders', label: t('syncPage.folder'), value: fullySelectedSourceFolders.value.length, tone: ''},
    {
      key: 'writes',
      label: t('syncPage.statWrites'),
      value: sourceCount.value * targetCount.value,
      tone: 'is-brand',
    },
  ]);

  const currentPlanSummary = computed(() => [
    {
      label: t('syncPage.syncDirection'),
      values: [
        isToWiseMind() ? t('syncPage.toWiseMindDirection') : t('syncPage.toObsidianDirection'),
      ],
      emptyText: '',
    },
    {
      label: isToWiseMind() ? t('syncPage.selectedContent') : t('syncPage.selectedWiseMindContent'),
      values: [
        isToWiseMind()
          ? t('syncPage.obsidianNoteCount', {count: selectedObsidian.value.size})
          : t('syncPage.wiseMindContentCount', {
              count: selectedWiseMindForActiveCategory.value.length,
            }),
      ],
      emptyText: t('syncPage.noSelectedContent'),
    },
    {
      label: t('syncPage.sourceFolder'),
      values: fullySelectedSourceFolders.value,
      emptyText: t('syncPage.noFullFolder'),
    },
    {
      label: isToWiseMind() ? t('syncPage.saveTo') : t('syncPage.writeToObsidian'),
      values: selectedTargetTitles.value,
      emptyText: t('syncPage.noSelectedTarget'),
    },
  ]);

  const sourceMissingText = computed(() =>
    isToWiseMind() ? t('syncPage.chooseObsidianFirst') : t('syncPage.chooseWiseMindContentFirst'),
  );
  const targetMissingText = computed(() =>
    isToWiseMind()
      ? t('syncPage.chooseWiseMindTargetFirst')
      : t('syncPage.chooseObsidianFolderFirst'),
  );

  const validateSource = () => {
    if (sourceCount.value) return true;
    new Notice(sourceMissingText.value);
    return false;
  };
  const validateTarget = () => {
    if (targetCount.value) return true;
    new Notice(targetMissingText.value);
    return false;
  };

  const buildCurrentSyncPreview = () =>
    buildSyncPreview(
      {
        direction: direction.value,
        sourceCount: isToWiseMind()
          ? selectedObsidian.value.size
          : selectedWiseMindForActiveCategory.value.length,
        targetLabels: isToWiseMind()
          ? allDestinations()
              .filter(item => selectedDestinations.value.has(item.key))
              .map(item => `${item.meta}: ${item.title}`)
              .concat(wiseMindWorkspaceScopeText.value)
          : Array.from(selectedObsidianFolders.value).map(folder => folder || t('syncPage.rootFolder')),
        // Execution always applies overwriteExisting, so the preview reflects it for both directions.
        overwriteExisting: overwriteExisting.value,
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
  const confirmPreview = computed(() => buildCurrentSyncPreview());

  return {
    sourceCount,
    targetCount,
    selectedHint,
    fullySelectedSourceFolders,
    selectedTargetTitles,
    sourceCountText,
    targetCountText,
    targetSummaryText,
    confirmTiles,
    currentPlanSummary,
    sourceMissingText,
    targetMissingText,
    validateSource,
    validateTarget,
    buildCurrentSyncPreview,
    confirmPreview,
  };
}

export type SyncSummary = ReturnType<typeof useSyncSummary>;
