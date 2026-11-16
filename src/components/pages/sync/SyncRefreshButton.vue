<script setup lang="ts">
  import {useI18n} from 'vue-i18n';
  import {ArrowPathIcon} from '@heroicons/vue/24/outline';

  import WmTooltip from '../../WmTooltip.vue';

  import {useSyncState} from './syncState';

  const {t} = useI18n();
  const {loading, running, refresh} = useSyncState();
</script>

<template>
  <WmTooltip :content="t('syncPage.refresh')">
    <button class="wm2-icon-btn" type="button" :disabled="loading || running" @click="refresh">
      <span class="wm-visually-hidden">{{ t('syncPage.refresh') }}</span>
      <ArrowPathIcon class="wm-icon" :class="{'wm2-spin': loading}" />
    </button>
  </WmTooltip>
</template>
