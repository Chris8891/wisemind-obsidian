<script setup lang="ts">
  import {useI18n} from 'vue-i18n';
  import {CheckIcon, TrashIcon, XMarkIcon} from '@heroicons/vue/24/outline';

  import WmDialog from '../../WmDialog.vue';

  import {useSyncState} from './syncState';

  const {t} = useI18n();
  const {
    savePlanOpen,
    renamePlanOpen,
    deletePlanOpen,
    pendingPlanName,
    pendingRenamePlanName,
    pendingDeletePlan,
    currentPlanSummary,
    saveCurrentAsPlan,
    confirmRenamePlan,
    confirmDeletePlan,
  } = useSyncState();
</script>

<template>
  <WmDialog v-model:open="savePlanOpen" :title="t('syncPage.saveNewPlan')" content-class="wm2-sync-dialog">
    <ul class="wm2-card wm2-list-card wm2-sync-kv">
      <li v-for="item in currentPlanSummary" :key="item.label">
        <span class="wm2-muted">{{ item.label }}</span>
        <span class="wm2-row wm2-chips wm2-sync-kv-values">
          <span
            v-for="value in item.values.length ? item.values : [item.emptyText]"
            :key="value"
            class="wm2-chip"
            :class="{'is-accent': item.values.length}"
            >{{ value }}</span
          >
        </span>
      </li>
    </ul>
    <label class="wm2-sync-field">
      <span class="wm2-muted">{{ t('syncPage.planNameLabel') }}</span>
      <input
        v-model="pendingPlanName"
        class="wm2-sync-input"
        type="text"
        :placeholder="t('syncPage.planNamePlaceholder')"
        @keydown.enter.prevent="saveCurrentAsPlan"
      />
    </label>
    <footer class="wm2-dialog-actions">
      <button class="wm2-btn is-sm" type="button" @click="savePlanOpen = false">
        <XMarkIcon class="wm-icon" />
        {{ t('syncPage.cancel') }}
      </button>
      <button
        class="wm2-btn is-primary is-sm"
        type="button"
        :disabled="!pendingPlanName.trim()"
        @click="saveCurrentAsPlan"
      >
        <CheckIcon class="wm-icon" />
        {{ t('syncPage.save') }}
      </button>
    </footer>
  </WmDialog>

  <WmDialog v-model:open="renamePlanOpen" :title="t('syncPage.renamePlanTitle')" content-class="wm2-sync-dialog">
    <label class="wm2-sync-field">
      <span class="wm2-muted">{{ t('syncPage.planNameLabel') }}</span>
      <input
        v-model="pendingRenamePlanName"
        class="wm2-sync-input"
        type="text"
        :placeholder="t('syncPage.planNamePlaceholder')"
        @keydown.enter.prevent="confirmRenamePlan"
      />
    </label>
    <footer class="wm2-dialog-actions">
      <button class="wm2-btn is-sm" type="button" @click="renamePlanOpen = false">
        <XMarkIcon class="wm-icon" />
        {{ t('syncPage.cancel') }}
      </button>
      <button
        class="wm2-btn is-primary is-sm"
        type="button"
        :disabled="!pendingRenamePlanName.trim()"
        @click="confirmRenamePlan"
      >
        <CheckIcon class="wm-icon" />
        {{ t('syncPage.save') }}
      </button>
    </footer>
  </WmDialog>

  <WmDialog v-model:open="deletePlanOpen" :title="t('syncPage.deletePlanTitle')" content-class="wm2-sync-dialog">
    <p class="wm2-muted">
      {{ t('syncPage.deletePlanConfirm', {name: pendingDeletePlan?.name || ''}) }}
    </p>
    <footer class="wm2-dialog-actions">
      <button class="wm2-btn is-sm" type="button" @click="deletePlanOpen = false">
        <XMarkIcon class="wm-icon" />
        {{ t('syncPage.cancel') }}
      </button>
      <button class="wm2-btn is-sm wm2-sync-danger" type="button" @click="confirmDeletePlan">
        <TrashIcon class="wm-icon" />
        {{ t('syncPage.delete') }}
      </button>
    </footer>
  </WmDialog>
</template>
