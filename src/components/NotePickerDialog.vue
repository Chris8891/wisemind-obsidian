<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/vue/24/outline';
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';

import { useVaultNotes } from '../composables/useVaultNotes';
import type { ObsidianSourceItem } from '../types';

import WmTooltip from './WmTooltip.vue';

const props = defineProps<{
  open: boolean;
  selectedPaths: string[];
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  confirm: [notes: ObsidianSourceItem[]];
}>();

const { notes, filteredNotes, query, refresh } = useVaultNotes();
const selected = ref(new Set(props.selectedPaths));
const expandedGroups = ref(new Set<string>(['根目录']));

const selectedNotes = computed(() => notes.value.filter(note => selected.value.has(note.path)));
const groups = computed(() => {
  const grouped = new Map<string, ObsidianSourceItem[]>();
  filteredNotes.value.forEach(note => {
    const folder = note.folderPath || '根目录';
    grouped.set(folder, [...(grouped.get(folder) || []), note]);
  });
  return Array.from(grouped.entries()).map(([title, items]) => ({ title, items }));
});

const toggle = (path: string) => {
  const next = new Set(selected.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  selected.value = next;
};

const selectAll = () => {
  selected.value = new Set(filteredNotes.value.map(note => note.path));
};

const toggleGroup = (items: ObsidianSourceItem[]) => {
  const all = items.length > 0 && items.every(note => selected.value.has(note.path));
  const next = new Set(selected.value);
  items.forEach(note => {
    if (all) next.delete(note.path);
    else next.add(note.path);
  });
  selected.value = next;
};

const toggleExpanded = (title: string) => {
  const next = new Set(expandedGroups.value);
  if (next.has(title)) next.delete(title);
  else next.add(title);
  expandedGroups.value = next;
};

watch(() => props.selectedPaths, value => {
  selected.value = new Set(value);
});

onMounted(() => void refresh());
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal to="#wisemindai-obsidian-root">
      <DialogOverlay class="wm-modal-overlay">
        <DialogContent class="wm-modal-box wm-note-picker">
          <header class="wm-history-dialog-header">
            <DialogTitle class="wm-dialog-title">选择多篇笔记</DialogTitle>
            <DialogClose
              class="btn btn-sm btn-circle btn-ghost absolute right-4 top-4"
              aria-label="关闭"
              >✕</DialogClose
            >
          </header>

          <div class="wm-note-picker-toolbar">
            <input v-model="query" class="wm-input" placeholder="搜索笔记标题或路径" />
            <span class="wm-muted">已选 {{ selected.size }} 篇</span>
            <button class="wm-button" type="button" @click="selectAll">全选所有</button>
            <button class="wm-button" type="button" @click="selected = new Set()">清空所有</button>
          </div>

          <div class="wm-sync-list wm-note-tree-list">
            <article v-for="group in groups" :key="group.title" class="wm-sync-tree-group">
              <button class="wm-sync-tree-header" type="button" @click="toggleExpanded(group.title)">
                <component :is="expandedGroups.has(group.title) ? ChevronDownIcon : ChevronRightIcon" class="wm-icon" />
                <input
                  type="checkbox"
                  :checked="group.items.length > 0 && group.items.every(note => selected.has(note.path))"
                  @click.stop
                  @change="toggleGroup(group.items)"
                />
                <strong>{{ group.title }}</strong>
                <span>已选 {{ group.items.filter(note => selected.has(note.path)).length }}/{{ group.items.length }}</span>
              </button>
              <div v-if="expandedGroups.has(group.title)" class="wm-sync-tree-children">
                <WmTooltip
                  v-for="note in group.items"
                  :key="note.path"
                  :content="note.path"
                  side="top"
                >
                <label class="wm-sync-row">
                  <input
                    type="checkbox"
                    :checked="selected.has(note.path)"
                    @change="toggle(note.path)"
                  />
                  <span>{{ note.title }}</span>
                  <small>{{ note.path }}</small>
                </label>
                </WmTooltip>
              </div>
            </article>
          </div>

          <footer class="wm-dialog-actions">
            <DialogClose class="wm-button" type="button">取消</DialogClose>
            <button class="wm-button is-primary" type="button" @click="emit('confirm', selectedNotes)">确定</button>
          </footer>
        </DialogContent>
      </DialogOverlay>
    </DialogPortal>
  </DialogRoot>
</template>
