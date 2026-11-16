<script setup lang="ts">
  import {useI18n} from 'vue-i18n';
  import {ChevronRightIcon} from '@heroicons/vue/24/outline';

  import SyncHighlight from './SyncHighlight.vue';
  import SyncNoMatch from './SyncNoMatch.vue';
  import {useSyncState} from './syncState';

  const {t} = useI18n();
  const {
    loading,
    activeTree,
    showNoMatches,
    treeEmptyText,
    expandedGroups,
    activeQuery,
    toggleExpanded,
    toggleTreeGroup,
    toggleTreeRow,
    showMoreRows,
  } = useSyncState();
</script>

<template>
  <div class="wm2-card wm2-sync-tree">
    <div v-if="loading && !activeTree.length" class="wm2-sync-skeleton-list" aria-hidden="true">
      <span v-for="index in 6" :key="index" class="wm2-sync-skeleton-row">
        <span class="wm2-sync-skeleton is-box"></span>
        <span class="wm2-sync-skeleton is-line"></span>
      </span>
    </div>
    <SyncNoMatch v-else-if="!activeTree.length && showNoMatches" />
    <div v-else-if="!activeTree.length" class="wm2-empty is-compact">
      <p>{{ treeEmptyText }}</p>
    </div>
    <article
      v-for="group in activeTree"
      :key="group.id"
      class="wm2-sync-group"
      :class="{'is-open': expandedGroups.has(group.id)}"
    >
      <div
        class="wm2-sync-row is-group"
        :class="{'is-checked': group.checked, 'has-selection': group.selectedCount > 0}"
        :title="group.title"
        @click="toggleExpanded(group.id)"
      >
        <button
          class="wm2-icon-btn is-sm wm2-sync-chevron"
          type="button"
          :aria-expanded="expandedGroups.has(group.id)"
          :aria-label="
            expandedGroups.has(group.id) ? t('taskHistory.collapse') : t('taskHistory.expand')
          "
          @click.stop="toggleExpanded(group.id)"
        >
          <ChevronRightIcon class="wm-icon" />
        </button>
        <input
          v-if="group.checkable"
          type="checkbox"
          :checked="group.checked"
          :indeterminate="group.partial"
          :aria-label="group.title"
          @click.stop
          @change="toggleTreeGroup(group.id)"
        />
        <component :is="group.icon" class="wm-icon wm2-sync-folder-icon" />
        <span class="wm2-sync-row-title wm2-truncate"
          ><SyncHighlight :text="group.title" :query="activeQuery"
        /></span>
        <small
          class="wm2-sync-count-chip wm2-tabular"
          :class="{'is-active': group.selectedCount > 0}"
          :title="group.countTitle"
          >{{ group.selectedCount ? `${group.selectedCount}/${group.total}` : group.total }}</small
        >
      </div>
      <div v-if="expandedGroups.has(group.id)" class="wm2-sync-children">
        <label
          v-for="row in group.rows"
          :key="row.key"
          class="wm2-sync-row"
          :class="{'is-checked': row.checked}"
          :title="row.meta ? `${row.title}\n${row.meta}` : row.title"
        >
          <input type="checkbox" :checked="row.checked" @change="toggleTreeRow(row.key, $event)" />
          <component :is="group.rowIcon" class="wm-icon wm2-sync-doc-icon" />
          <span class="wm2-list-main">
            <span class="wm2-truncate"
              ><SyncHighlight :text="row.title" :query="activeQuery"
            /></span>
            <small class="wm2-muted wm2-truncate">{{ row.meta }}</small>
          </span>
        </label>
        <button
          v-if="group.total > group.rows.length"
          class="wm2-btn is-ghost is-xs wm2-sync-more"
          type="button"
          @click="showMoreRows(group.id)"
        >
          {{ t('syncPage.showMoreRows', {count: group.total - group.rows.length}) }}
        </button>
      </div>
    </article>
  </div>
</template>
