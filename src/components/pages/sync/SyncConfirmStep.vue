<script setup lang="ts">
  import {useI18n} from 'vue-i18n';
  import {ArrowRightIcon, BookmarkSquareIcon, ExclamationTriangleIcon} from '@heroicons/vue/24/outline';

  import SyncProgressCard from './SyncProgressCard.vue';
  import SyncResultTiles from './SyncResultTiles.vue';
  import {useSyncState} from './syncState';

  const {t} = useI18n();
  const {
    running,
    direction,
    directionLabel,
    overwriteExisting,
    includeFolderStructure,
    wiseMindWorkspaceScopeText,
    sourceCountText,
    targetSummaryText,
    confirmTiles,
    selectedTargetTitles,
    confirmPreview,
    openSavePlanDialog,
  } = useSyncState();
</script>

<template>
  <fieldset class="wm2-sync-pane" :disabled="running">
    <section class="wm2-card is-highlight wm2-sync-confirm">
      <p class="wm2-sync-route is-strong">
        <span class="wm2-truncate">{{ sourceCountText }}</span>
        <ArrowRightIcon class="wm-icon" />
        <span class="wm2-truncate">{{ targetSummaryText }}</span>
      </p>
      <SyncResultTiles :tiles="confirmTiles" />
      <div v-if="selectedTargetTitles.length > 1" class="wm2-row wm2-chips">
        <span v-for="title in selectedTargetTitles" :key="title" class="wm2-chip" :title="title">{{
          title
        }}</span>
      </div>
      <small class="wm2-muted">{{ directionLabel(direction) }}</small>
      <small v-if="direction === 'to-wisemind'" class="wm2-muted">{{
        wiseMindWorkspaceScopeText
      }}</small>
    </section>

    <div class="wm2-sync-policy" role="radiogroup">
      <span class="wm2-sync-policy-title">{{ t('syncPage.duplicatePolicyTitle') }}</span>
      <label>
        <input
          type="radio"
          name="wm2-sync-policy"
          :checked="overwriteExisting"
          @change="overwriteExisting = true"
        />
        {{ t('syncPage.policyUpdate') }}
      </label>
      <label>
        <input
          type="radio"
          name="wm2-sync-policy"
          :checked="!overwriteExisting"
          @change="overwriteExisting = false"
        />
        {{ t('syncPage.policySkip') }}
      </label>
    </div>

    <label v-if="direction === 'to-obsidian'" class="wm2-sync-check">
      <input v-model="includeFolderStructure" type="checkbox" />
      {{ t('syncPage.includeFolderStructure') }}
    </label>

    <button class="wm2-btn is-ghost is-xs wm2-sync-save-plan" type="button" @click="openSavePlanDialog">
      <BookmarkSquareIcon class="wm-icon" />
      {{ t('syncPage.saveNewPlan') }}
    </button>

    <div v-if="confirmPreview.warningText" class="wm2-sync-alert" role="alert">
      <ExclamationTriangleIcon class="wm-icon" />
      <span>{{ confirmPreview.warningText }}</span>
    </div>

    <SyncProgressCard v-if="running" />
  </fieldset>
</template>
