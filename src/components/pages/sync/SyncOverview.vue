<script setup lang="ts">
  import {useI18n} from 'vue-i18n';
  import {ArrowPathIcon, CheckCircleIcon, CircleStackIcon, ExclamationTriangleIcon} from '@heroicons/vue/24/outline';

  import {openTopicsOverview} from '../../../services/panelStore';

  import SyncRulesPanel from './rules/SyncRulesPanel.vue';
  import SyncDirectionSwitch from './SyncDirectionSwitch.vue';
  import SyncOverviewStats from './SyncOverviewStats.vue';
  import SyncPlanList from './SyncPlanList.vue';
  import SyncProgressCard from './SyncProgressCard.vue';
  import SyncRefreshButton from './SyncRefreshButton.vue';
  import SyncResultSummary from './SyncResultSummary.vue';
  import {useSyncState} from './syncState';

  const emit = defineEmits<{
    openHistory: [];
  }>();

  const {t} = useI18n();
  const {running, loading, connectionError, result, wiseMindWorkspaceScopeText, refresh} = useSyncState();
</script>

<template>
  <div class="wm2-subbar">
    <strong>{{ t('syncPage.title') }}</strong>
    <div class="wm2-subbar-actions">
      <button class="wm2-btn is-ghost is-xs" type="button" @click="openTopicsOverview">
        <CircleStackIcon class="wm-icon" />
        {{ t('topicsOverview.entry') }}
      </button>
      <SyncRefreshButton />
    </div>
  </div>

  <p class="wm2-sync-scope">
    <CheckCircleIcon class="wm-icon" />
    <span>
      <strong>{{ wiseMindWorkspaceScopeText }}</strong>
      <small>{{ t('syncPage.workspaceScopeDesc') }}</small>
    </span>
  </p>

  <SyncRulesPanel />

  <h4 class="wm2-section-title wm2-sync-send-title">
    <span>{{ t('syncRules.sendSection') }}</span>
  </h4>

  <SyncDirectionSwitch lock-while-running />

  <SyncOverviewStats @open-history="emit('openHistory')" />

  <div v-if="connectionError && !loading" class="wm2-sync-alert is-error" role="alert">
    <ExclamationTriangleIcon class="wm-icon" />
    <span class="wm2-sync-alert-text">{{ connectionError }}</span>
    <button class="wm2-btn is-xs" type="button" @click="refresh">
      <ArrowPathIcon class="wm-icon" />
      {{ t('syncPage.refresh') }}
    </button>
  </div>

  <SyncProgressCard v-if="running" />
  <SyncResultSummary v-else-if="result" />

  <SyncPlanList />
</template>
