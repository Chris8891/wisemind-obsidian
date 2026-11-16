<script setup lang="ts">
  import {computed} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {CheckIcon, ChevronLeftIcon} from '@heroicons/vue/24/outline';

  import WmTooltip from '../../WmTooltip.vue';

  import SyncConfirmStep from './SyncConfirmStep.vue';
  import SyncPickerStep from './SyncPickerStep.vue';
  import SyncRefreshButton from './SyncRefreshButton.vue';
  import {useSyncState} from './syncState';

  const {t} = useI18n();
  const {running, view, step, goToStep} = useSyncState();

  const wizardSteps = computed(() => [
    t('syncPage.stepContent'),
    t('syncPage.stepTarget'),
    t('syncPage.stepConfirm'),
  ]);
</script>

<template>
  <div class="wm2-subbar">
    <WmTooltip :content="t('shell.back')">
      <button class="wm2-icon-btn" type="button" :disabled="running" @click="view = 'overview'">
        <span class="wm-visually-hidden">{{ t('shell.back') }}</span>
        <ChevronLeftIcon class="wm-icon" />
      </button>
    </WmTooltip>
    <strong>{{ t('syncPage.manualSync') }}</strong>
    <SyncRefreshButton />
  </div>

  <ol class="wm2-sync-steps">
    <li
      v-for="(label, index) in wizardSteps"
      :key="label"
      :class="{'is-active': index === step, 'is-done': index < step}"
      :aria-current="index === step ? 'step' : undefined"
    >
      <button
        class="wm2-plain-button wm2-sync-step"
        type="button"
        :disabled="index >= step || running"
        :title="index < step ? t('syncPage.backToStep', {step: label}) : undefined"
        @click="goToStep(index)"
      >
        <span class="wm2-sync-step-dot wm2-tabular">
          <CheckIcon v-if="index < step" class="wm-icon" />
          <template v-else>{{ index + 1 }}</template>
        </span>
        <span class="wm2-sync-step-label wm2-truncate">{{ label }}</span>
      </button>
    </li>
  </ol>

  <SyncPickerStep v-if="step < 2" />
  <SyncConfirmStep v-else />
</template>
