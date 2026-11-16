<script setup lang="ts">
  import {useI18n} from 'vue-i18n';

  import {useSyncState} from './syncState';

  const {t} = useI18n();
  const {selectedHint, runProgress, runPercent} = useSyncState();
</script>

<template>
  <section class="wm2-card wm2-sync-running" role="status" aria-live="polite">
    <div class="wm2-sync-running-head">
      <span class="wm2-spinner"></span>
      <div class="wm2-list-main">
        <strong>{{ t('syncPage.syncing') }}</strong>
        <small class="wm2-muted wm2-truncate">{{ selectedHint }}</small>
      </div>
      <span v-if="runProgress.total" class="wm2-sync-running-count wm2-tabular"
        >{{ runProgress.completed }} / {{ runProgress.total }}</span
      >
    </div>
    <progress
      class="wm2-sync-progress"
      :class="{'is-indeterminate': !runProgress.total}"
      :max="100"
      :value="runPercent"
    ></progress>
  </section>
</template>
