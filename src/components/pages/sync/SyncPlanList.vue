<script setup lang="ts">
  import {computed} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowDownTrayIcon,
    ArrowUpTrayIcon,
    BookmarkSquareIcon,
    EllipsisHorizontalIcon,
    PlusIcon,
  } from '@heroicons/vue/24/outline';

  import {ENABLE_REVERSE_SYNC} from '../../../features';
  import WmTooltip from '../../WmTooltip.vue';

  import {useSyncState} from './syncState';

  const {t} = useI18n();
  const {plugin, running, sortedPlans, openSavePlanDialog, applyPlanAndReview, planMeta, openPlanMenu} =
    useSyncState();
  // Saved WiseMindAI -> Obsidian plans stay in settings but are not offered while reverse sync is hidden.
  const visiblePlans = computed(() =>
    ENABLE_REVERSE_SYNC ? sortedPlans.value : sortedPlans.value.filter(plan => plan.direction !== 'to-obsidian'),
  );
</script>

<template>
  <section class="wm2-section">
    <h4 class="wm2-section-title">
      <span>{{ t('syncPage.syncPlan') }}</span>
      <button class="wm2-btn is-ghost is-xs" type="button" @click="openSavePlanDialog">
        <PlusIcon class="wm-icon" />
        {{ t('syncPage.saveNewPlan') }}
      </button>
    </h4>
    <ul v-if="visiblePlans.length" class="wm2-card wm2-list-card wm2-sync-plans">
      <li
        v-for="plan in visiblePlans"
        :key="plan.id"
        class="wm2-list-row wm2-sync-plan-row"
        :class="{'is-default': plan.id === plugin.settings.defaultSyncPlanId}"
      >
        <span class="wm2-tile" :class="{'is-info': plan.direction === 'to-obsidian'}">
          <ArrowUpTrayIcon v-if="plan.direction === 'to-wisemind'" class="wm-icon" />
          <ArrowDownTrayIcon v-else class="wm-icon" />
        </span>
        <div class="wm2-list-main">
          <span class="wm2-sync-plan-name">
            <strong class="wm2-truncate" :title="plan.name">{{ plan.name }}</strong>
            <span v-if="plan.id === plugin.settings.defaultSyncPlanId" class="wm2-chip is-success">{{
              t('syncPage.defaultPlan')
            }}</span>
          </span>
          <small class="wm2-muted wm2-truncate" :title="planMeta(plan)">{{ planMeta(plan) }}</small>
        </div>
        <button class="wm2-btn is-xs" type="button" :disabled="running" @click="applyPlanAndReview(plan)">
          {{ t('syncPage.apply') }}
        </button>
        <WmTooltip :content="t('shell.more')">
          <button
            class="wm2-icon-btn is-sm"
            type="button"
            :disabled="running"
            @click="openPlanMenu($event, plan)"
          >
            <span class="wm-visually-hidden">{{ t('shell.more') }}</span>
            <EllipsisHorizontalIcon class="wm-icon" />
          </button>
        </WmTooltip>
      </li>
    </ul>
    <div v-else class="wm2-card wm2-empty is-compact">
      <BookmarkSquareIcon class="wm2-empty-icon" />
      <p>{{ t('syncPage.noPlans') }}</p>
      <p class="wm2-muted">{{ t('syncPage.planHint') }}</p>
    </div>
  </section>
</template>
