<script setup lang="ts">
  import {nextTick, ref, watch} from 'vue';

  import {panelState} from '../../services/panelStore';
  import WiseMindConnectionDialog from '../WiseMindConnectionDialog.vue';

  import SyncFooter from './sync/SyncFooter.vue';
  import SyncOverview from './sync/SyncOverview.vue';
  import SyncPlanDialogs from './sync/SyncPlanDialogs.vue';
  import SyncPreviewDialog from './sync/SyncPreviewDialog.vue';
  import SyncResultDialog from './sync/SyncResultDialog.vue';
  import {provideSyncState} from './sync/syncState';
  import SyncWizard from './sync/SyncWizard.vue';
  import TopicsOverview from './sync/TopicsOverview.vue';

  const props = defineProps<{
    historyItemId?: string;
    historyToken?: number;
  }>();
  const emit = defineEmits<{
    openHistory: [];
  }>();

  const {running, loading, view, step, connectionDialogOpen, openHistoryItem} = provideSyncState();
  const bodyRef = ref<HTMLElement | null>(null);

  watch([view, step], () => {
    void nextTick(() => bodyRef.value?.scrollTo({top: 0, behavior: 'smooth'}));
  });

  watch(
    () => props.historyToken,
    () => openHistoryItem(props.historyItemId),
    {immediate: true},
  );
</script>

<template>
  <section class="wm2-sync" :class="{'is-running': running}" :aria-busy="running || loading">
    <Transition name="wm2-view" mode="out-in">
      <TopicsOverview v-if="panelState.topicsOverviewOpen" key="topics" />
      <div v-else key="main" class="wm2-sync-main">
        <div ref="bodyRef" class="wm2-sync-body">
          <Transition name="wm2-view" mode="out-in">
            <div v-if="view === 'overview'" key="overview" class="wm2-sync-stage">
              <SyncOverview @open-history="emit('openHistory')" />
            </div>
            <div v-else key="wizard" class="wm2-sync-stage">
              <SyncWizard />
            </div>
          </Transition>
        </div>

        <SyncFooter @open-history="emit('openHistory')" />
      </div>
    </Transition>

    <WiseMindConnectionDialog v-model:open="connectionDialogOpen" />
    <SyncPreviewDialog />
    <SyncResultDialog />
    <SyncPlanDialogs />
  </section>
</template>
