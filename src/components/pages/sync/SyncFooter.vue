<script setup lang="ts">
  import {computed, useId} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowPathIcon,
    ArrowsRightLeftIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ClockIcon,
    ExclamationTriangleIcon,
    XMarkIcon,
  } from '@heroicons/vue/24/outline';

  import WmTooltip from '../../WmTooltip.vue';

  import {useSyncState} from './syncState';

  const emit = defineEmits<{
    openHistory: [];
  }>();

  const {t} = useI18n();
  const {
    view,
    step,
    running,
    loading,
    selectedHint,
    pickerCountText,
    blockedReason,
    openWizard,
    prepareExecute,
    goBack,
    goNext,
    runFromWizard,
  } = useSyncState();

  const footerInfoId = useId();
  const showBlocked = computed(() => !!blockedReason.value && !running.value);
  const footerInfo = computed(() =>
    showBlocked.value ? blockedReason.value : step.value === 2 ? selectedHint.value : pickerCountText.value,
  );
</script>

<template>
  <footer v-if="view === 'overview'" class="wm2-sync-footer is-overview">
    <WmTooltip :content="t('syncPage.history')">
      <button class="wm2-btn is-ghost is-sm wm2-sync-history-btn" type="button" @click="emit('openHistory')">
        <ClockIcon class="wm-icon" />
        <span class="wm2-sync-footer-label">{{ t('syncPage.history') }}</span>
      </button>
    </WmTooltip>
    <span class="wm2-sync-footer-info wm2-muted wm2-truncate wm2-tabular" :title="selectedHint">{{
      selectedHint
    }}</span>
    <button class="wm2-btn is-sm" type="button" :disabled="running" @click="openWizard(0)">
      <ArrowsRightLeftIcon class="wm-icon" />
      {{ t('syncPage.manualSync') }}
    </button>
    <button
      class="wm2-btn is-primary is-sm"
      type="button"
      :disabled="running || loading"
      @click="prepareExecute"
    >
      <span v-if="running" class="wm2-spinner"></span>
      <ArrowPathIcon v-else class="wm-icon" />
      {{ running ? t('syncPage.syncing') : t('syncPage.execute') }}
    </button>
  </footer>

  <footer v-else class="wm2-sync-footer">
    <span
      :id="footerInfoId"
      class="wm2-sync-footer-info wm2-truncate wm2-tabular"
      :class="showBlocked ? 'is-warning' : 'wm2-muted'"
      :title="footerInfo"
      aria-live="polite"
    >
      <ExclamationTriangleIcon v-if="showBlocked" class="wm-icon" />
      {{ footerInfo }}
    </span>
    <button class="wm2-btn is-sm" type="button" :disabled="running" @click="goBack">
      <XMarkIcon v-if="step === 0" class="wm-icon" />
      <ChevronLeftIcon v-else class="wm-icon" />
      {{ step === 0 ? t('syncPage.cancel') : t('shell.back') }}
    </button>
    <button
      v-if="step < 2"
      class="wm2-btn is-primary is-sm"
      type="button"
      :disabled="!!blockedReason"
      :aria-describedby="footerInfoId"
      @click="goNext"
    >
      {{ t('onboarding.next') }}
      <ChevronRightIcon class="wm-icon" />
    </button>
    <button
      v-else
      class="wm2-btn is-primary is-sm"
      type="button"
      :disabled="running || loading || !!blockedReason"
      :aria-describedby="footerInfoId"
      @click="runFromWizard"
    >
      <span v-if="running" class="wm2-spinner"></span>
      <ArrowPathIcon v-else class="wm-icon" />
      {{ running ? t('syncPage.syncing') : t('syncPage.confirmSync') }}
    </button>
  </footer>
</template>
