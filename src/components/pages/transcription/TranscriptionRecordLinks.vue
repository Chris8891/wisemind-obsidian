<script setup lang="ts">
  import {useI18n} from 'vue-i18n';
  import {ClockIcon, ListBulletIcon} from '@heroicons/vue/24/outline';

  defineProps<{openingRecords: boolean}>();
  const emit = defineEmits<{openHistory: []; openAllRecords: []}>();
  const {t} = useI18n();
</script>

<template>
  <button class="wm2-btn is-ghost is-sm" type="button" @click="emit('openHistory')">
    <ClockIcon class="wm-icon" />
    {{ t('transcription.history') }}
  </button>
  <button
    class="wm2-icon-btn"
    type="button"
    :title="t('transcription.viewAllRecords')"
    :aria-label="t('transcription.viewAllRecords')"
    :disabled="openingRecords"
    @click="emit('openAllRecords')"
  >
    <span v-if="openingRecords" class="wm2-spinner"></span>
    <ListBulletIcon v-else class="wm-icon" />
  </button>
</template>
