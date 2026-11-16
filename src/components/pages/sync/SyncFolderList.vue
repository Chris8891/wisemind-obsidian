<script setup lang="ts">
  import {useI18n} from 'vue-i18n';
  import {FolderIcon} from '@heroicons/vue/24/outline';

  import SyncHighlight from './SyncHighlight.vue';
  import SyncNoMatch from './SyncNoMatch.vue';
  import {useSyncState} from './syncState';

  const {t} = useI18n();
  const {obsidianTargetFolders, selectedObsidianFolders, activeQuery, toggleFolder} = useSyncState();
</script>

<template>
  <div class="wm2-card wm2-sync-tree">
    <label
      v-for="folder in obsidianTargetFolders"
      :key="folder"
      class="wm2-sync-row"
      :class="{'is-checked': selectedObsidianFolders.has(folder)}"
      :title="folder || t('syncPage.vaultRoot')"
    >
      <input
        type="checkbox"
        :checked="selectedObsidianFolders.has(folder)"
        @change="toggleFolder(folder, ($event.target as HTMLInputElement).checked)"
      />
      <FolderIcon class="wm-icon wm2-sync-folder-icon" />
      <span class="wm2-sync-row-title wm2-truncate"
        ><SyncHighlight :text="folder || t('syncPage.rootFolder')" :query="activeQuery"
      /></span>
      <small class="wm2-sync-count">{{
        folder ? t('syncPage.folder') : t('syncPage.vaultRoot')
      }}</small>
    </label>
    <SyncNoMatch v-if="!obsidianTargetFolders.length" />
  </div>
</template>
