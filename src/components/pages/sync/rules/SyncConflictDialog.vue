<script setup lang="ts">
  import {computed} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {ArrowUpTrayIcon, ClockIcon, ShieldCheckIcon} from '@heroicons/vue/24/outline';

  import {diffText} from '../../../../services/textDiff';
  import type {SyncConflictItem} from '../../../../sync/syncEngine';
  import WmDialog from '../../../WmDialog.vue';

  const DIFF_CHAR_LIMIT = 20000;

  const props = defineProps<{
    open: boolean;
    conflict: SyncConflictItem | null;
    busy?: boolean;
  }>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    resolve: [choice: 'overwrite' | 'keep'];
  }>();

  const {t} = useI18n();

  // Removed parts exist only in WiseMindAI, added parts only in Obsidian.
  const diff = computed(() => {
    const conflict = props.conflict;
    if (!conflict) return null;
    return diffText(conflict.remoteContent.slice(0, DIFF_CHAR_LIMIT), conflict.localContent.slice(0, DIFF_CHAR_LIMIT));
  });

  const remoteTime = computed(() => {
    const value = props.conflict?.remoteUpdatedAt;
    if (!value) return '';
    const date = new Date(typeof value === 'number' ? value : String(value));
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
  });

  const choose = (choice: 'overwrite' | 'keep') => emit('resolve', choice);
</script>

<template>
  <WmDialog
    :open="open"
    :title="t('syncRules.conflictTitle', {name: conflict?.title || ''})"
    :description="t('syncRules.conflictDesc')"
    content-class="wm2-sync-dialog wm2-sync-conflict-dialog"
    @update:open="emit('update:open', $event)"
  >
    <template v-if="conflict">
      <div class="wm2-sync-conflict-legend">
        <span class="wm2-chip is-success">{{ t('syncRules.conflictObsidian') }}</span>
        <span class="wm2-chip is-warning">{{ t('syncRules.conflictWiseMind') }}</span>
        <small v-if="remoteTime" class="wm2-muted">{{ t('syncRules.conflictRemoteTime', {time: remoteTime}) }}</small>
      </div>
      <div v-if="diff" class="wm2-card wm2-rewrite-text wm2-diff wm2-sync-conflict-diff">
        <template v-for="(part, index) in diff" :key="index">
          <ins v-if="part.type === 'added'">{{ part.text }}</ins>
          <del v-else-if="part.type === 'removed'">{{ part.text }}</del>
          <template v-else>{{ part.text }}</template>
        </template>
      </div>
      <div v-else class="wm2-rewrite-columns">
        <div class="wm2-card wm2-rewrite-text wm2-sync-conflict-diff">{{ conflict.localContent }}</div>
        <div class="wm2-card wm2-rewrite-text is-original wm2-sync-conflict-diff">{{ conflict.remoteContent }}</div>
      </div>
      <p class="wm2-muted wm2-sync-conflict-note">{{ t('syncRules.conflictOneWay') }}</p>
    </template>
    <footer class="wm2-dialog-actions">
      <button class="wm2-btn is-sm" type="button" :disabled="busy" @click="emit('update:open', false)">
        <ClockIcon class="wm-icon" />
        {{ t('syncRules.conflictLater') }}
      </button>
      <button class="wm2-btn is-sm" type="button" :disabled="busy" @click="choose('keep')">
        <ShieldCheckIcon class="wm-icon" />
        {{ t('syncRules.conflictKeep') }}
      </button>
      <button class="wm2-btn is-primary is-sm" type="button" :disabled="busy" @click="choose('overwrite')">
        <ArrowUpTrayIcon class="wm-icon" />
        {{ t('syncRules.conflictOverwrite') }}
      </button>
    </footer>
  </WmDialog>
</template>
