<script setup lang="ts">
  import {useI18n} from 'vue-i18n';
  import {
    ArrowPathIcon,
    ExclamationTriangleIcon,
    MagnifyingGlassIcon,
    PlusIcon,
    XMarkIcon,
  } from '@heroicons/vue/24/outline';

  import SyncDirectionSwitch from './SyncDirectionSwitch.vue';
  import SyncFolderList from './SyncFolderList.vue';
  import {useSyncState} from './syncState';
  import SyncTree from './SyncTree.vue';

  const {t} = useI18n();
  const {
    running,
    loading,
    direction,
    step,
    activeCategory,
    categoryOptions,
    newFolderName,
    searchInputRef,
    isFolderPicker,
    pickerSearch,
    pickerHeader,
    pickerPlaceholder,
    pickerCountText,
    pickerError,
    pickerAvailableCount,
    pickerSelectedCount,
    clearSearch,
    onSearchKeydown,
    selectAllPicker,
    clearAllPicker,
    createObsidianFolder,
    refresh,
  } = useSyncState();
</script>

<template>
  <fieldset class="wm2-sync-pane" :disabled="running">
    <SyncDirectionSwitch v-if="step === 0" />

    <div class="wm2-sync-pane-head">
      <strong>{{ pickerHeader.title }}</strong>
      <small class="wm2-muted">{{ pickerHeader.desc }}</small>
    </div>

    <div
      v-if="step === 0 && direction === 'to-obsidian'"
      class="wm2-segmented wm2-sync-segmented"
      role="radiogroup"
    >
      <button
        v-for="category in categoryOptions"
        :key="category.value"
        :class="{'is-active': activeCategory === category.value}"
        type="button"
        role="radio"
        :aria-checked="activeCategory === category.value"
        :title="category.label"
        @click="activeCategory = category.value"
      >
        <component :is="category.icon" class="wm-icon" />
        <span class="wm2-truncate">{{ category.label }}</span>
      </button>
    </div>

    <label class="wm2-sync-search">
      <MagnifyingGlassIcon class="wm-icon" />
      <input
        ref="searchInputRef"
        v-model="pickerSearch"
        type="text"
        :placeholder="pickerPlaceholder"
        :aria-label="pickerPlaceholder"
        @keydown="onSearchKeydown"
      />
      <button
        v-if="pickerSearch"
        class="wm2-icon-btn is-sm wm2-sync-search-clear"
        type="button"
        :aria-label="t('syncPage.clearSearch')"
        :title="t('syncPage.clearSearch')"
        @click="clearSearch"
      >
        <XMarkIcon class="wm-icon" />
      </button>
    </label>

    <div v-if="isFolderPicker" class="wm2-sync-create">
      <input
        v-model="newFolderName"
        class="wm2-sync-input"
        type="text"
        :placeholder="t('syncPage.newFolderPlaceholder')"
        @keydown.enter.prevent="createObsidianFolder"
      />
      <button
        class="wm2-btn is-sm"
        type="button"
        :disabled="!newFolderName.trim()"
        @click="createObsidianFolder"
      >
        <PlusIcon class="wm-icon" />
        {{ t('syncPage.create') }}
      </button>
    </div>

    <div class="wm2-sync-toolbar">
      <span
        class="wm2-sync-toolbar-count wm2-truncate wm2-tabular"
        :class="{'is-active': pickerSelectedCount > 0}"
        aria-live="polite"
        >{{ pickerCountText }}</span
      >
      <button
        class="wm2-btn is-ghost is-xs"
        type="button"
        :disabled="!pickerAvailableCount"
        @click="selectAllPicker"
      >
        {{ t('syncPage.selectAll') }}
      </button>
      <button
        class="wm2-btn is-ghost is-xs"
        type="button"
        :disabled="!pickerSelectedCount"
        @click="clearAllPicker"
      >
        {{ t('syncPage.clearAll') }}
      </button>
    </div>

    <div v-if="pickerError" class="wm2-card wm2-empty is-compact">
      <ExclamationTriangleIcon class="wm2-empty-icon" />
      <p>{{ pickerError }}</p>
      <button class="wm2-btn is-sm" type="button" :disabled="loading" @click="refresh">
        <ArrowPathIcon class="wm-icon" />
        {{ t('syncPage.refresh') }}
      </button>
    </div>

    <SyncFolderList v-else-if="isFolderPicker" />

    <SyncTree v-else />
  </fieldset>
</template>
