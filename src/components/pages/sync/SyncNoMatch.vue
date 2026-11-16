<script setup lang="ts">
  import {useI18n} from 'vue-i18n';
  import {MagnifyingGlassIcon, XMarkIcon} from '@heroicons/vue/24/outline';

  import {useSyncState} from './syncState';

  const {t} = useI18n();
  const {pickerSearch, clearSearch} = useSyncState();
</script>

<template>
  <div class="wm2-empty is-compact wm2-sync-no-match">
    <MagnifyingGlassIcon class="wm2-empty-icon" />
    <p>{{ t('syncPage.noMatchesFor', {query: pickerSearch.trim()}) }}</p>
    <button class="wm2-btn is-sm" type="button" @click="clearSearch">
      <XMarkIcon class="wm-icon" />
      {{ t('syncPage.clearSearch') }}
    </button>
  </div>
</template>
