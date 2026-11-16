<script setup lang="ts">
  import {computed, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    CheckIcon,
    ChevronRightIcon,
    DocumentTextIcon,
    FolderIcon,
    MagnifyingGlassIcon,
    XMarkIcon,
  } from '@heroicons/vue/24/outline';
  import {
    DialogClose,
    DialogContent,
    DialogOverlay,
    DialogPortal,
    DialogRoot,
    DialogTitle,
  } from 'reka-ui';

  import {focusDialogInitial} from '../composables/dialogFocus';
  import {useVaultNotes} from '../composables/useVaultNotes';
  import type {ObsidianSourceItem} from '../types';

  import WmTooltip from './WmTooltip.vue';

  const props = defineProps<{
    open: boolean;
    selectedPaths: string[];
  }>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    confirm: [notes: ObsidianSourceItem[]];
  }>();

  const {notes, filteredNotes, loading, query, refresh} = useVaultNotes();
  const {t} = useI18n();
  const selected = ref(new Set(props.selectedPaths));
  const expandedGroups = ref(new Set<string>([t('notePicker.rootFolder')]));

  const selectedNotes = computed(() => notes.value.filter(note => selected.value.has(note.path)));
  const groups = computed(() => {
    const grouped = new Map<string, ObsidianSourceItem[]>();
    filteredNotes.value.forEach(note => {
      const folder = note.folderPath || t('notePicker.rootFolder');
      grouped.set(folder, [...(grouped.get(folder) || []), note]);
    });
    return Array.from(grouped.entries()).map(([title, items]) => ({title, items}));
  });

  const toggle = (path: string) => {
    const next = new Set(selected.value);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    selected.value = next;
  };

  // With a search active, "select all" adds the matches to the existing selection instead of replacing it.
  const selectAll = () => {
    selected.value = new Set([...selected.value, ...filteredNotes.value.map(note => note.path)]);
  };

  const allFilteredSelected = computed(
    () => filteredNotes.value.length > 0 && filteredNotes.value.every(note => selected.value.has(note.path)),
  );

  const confirm = () => {
    if (loading.value && !notes.value.length) return;
    emit('confirm', selectedNotes.value);
  };

  const onEscapeKeyDown = (event: KeyboardEvent) => {
    if (!query.value) return;
    event.preventDefault();
    query.value = '';
  };

  // Enter confirms from the search box or a checkbox; buttons keep their own Enter behaviour.
  const onDialogKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
    const target = event.target as HTMLElement | null;
    if (!(target instanceof HTMLInputElement)) return;
    event.preventDefault();
    confirm();
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

  const groupSelectedCount = (items: ObsidianSourceItem[]) =>
    items.filter(note => selected.value.has(note.path)).length;

  const toggleExpanded = (title: string) => {
    const next = new Set(expandedGroups.value);
    if (next.has(title)) next.delete(title);
    else next.add(title);
    expandedGroups.value = next;
  };

  // Searching opens every folder that has a match, so results are never hidden inside a collapsed group.
  watch(query, value => {
    if (!value.trim()) return;
    expandedGroups.value = new Set([...expandedGroups.value, ...groups.value.map(group => group.title)]);
  });

  watch(
    () => props.selectedPaths,
    value => {
      selected.value = new Set(value);
    },
  );

  // Cancelling keeps the parent's paths unchanged, so reopening must drop the discarded edits.
  // The vault is scanned on open (not on mount) so pages that never open the picker skip the full read
  // and newly created or edited notes show up every time.
  watch(
    () => props.open,
    open => {
      if (!open) return;
      query.value = '';
      selected.value = new Set(props.selectedPaths);
      void refresh();
    },
    {immediate: true},
  );
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal to="#wisemindai-obsidian-root">
      <DialogOverlay class="wm2-dialog-overlay">
        <DialogContent
          class="wm2-dialog is-wide"
          :aria-describedby="undefined"
          @open-auto-focus="focusDialogInitial"
          @escape-key-down="onEscapeKeyDown"
          @keydown="onDialogKeydown"
        >
          <header class="wm2-dialog-header">
            <DialogTitle class="wm2-dialog-title">{{ t('notePicker.title') }}</DialogTitle>
            <DialogClose class="wm2-dialog-close" type="button" :aria-label="t('notePicker.close')"
              >✕</DialogClose
            >
          </header>

          <div class="wm2-picker-toolbar">
            <label class="wm2-search-field">
              <MagnifyingGlassIcon class="wm-icon" />
              <input
                v-model="query"
                type="text"
                :placeholder="t('notePicker.searchPlaceholder')"
                :aria-label="t('notePicker.searchPlaceholder')"
              />
              <button
                v-if="query"
                class="wm2-icon-btn is-sm wm2-search-clear"
                type="button"
                :aria-label="t('chat.clear')"
                @click="query = ''"
              >
                <XMarkIcon class="wm-icon" />
              </button>
            </label>
            <div class="wm2-picker-tools">
              <button
                class="wm2-btn is-ghost is-xs"
                type="button"
                :disabled="!filteredNotes.length || allFilteredSelected"
                @click="selectAll"
                >{{ t('notePicker.selectAll') }}</button
              >
              <button
                class="wm2-btn is-ghost is-xs"
                type="button"
                :disabled="!selected.size"
                @click="selected = new Set()"
                >{{ t('notePicker.clearAll') }}</button
              >
            </div>
          </div>

          <div class="wm2-card wm2-picker-list">
            <template v-for="group in groups" :key="group.title">
              <div
                class="wm2-picker-row is-folder"
                :class="{'is-expanded': expandedGroups.has(group.title)}"
              >
                <button
                  class="wm2-icon-btn is-sm wm2-picker-chevron"
                  type="button"
                  tabindex="-1"
                  :aria-hidden="true"
                  @click="toggleExpanded(group.title)"
                >
                  <ChevronRightIcon class="wm-icon" />
                </button>
                <input
                  class="wm2-checkbox"
                  type="checkbox"
                  :checked="group.items.length > 0 && groupSelectedCount(group.items) === group.items.length"
                  :indeterminate="
                    groupSelectedCount(group.items) > 0 &&
                    groupSelectedCount(group.items) < group.items.length
                  "
                  :aria-label="group.title"
                  @change="toggleGroup(group.items)"
                />
                <button
                  class="wm2-plain-button wm2-picker-folder"
                  type="button"
                  :aria-expanded="expandedGroups.has(group.title)"
                  @click="toggleExpanded(group.title)"
                >
                  <FolderIcon class="wm-icon" />
                  <strong class="wm2-truncate">{{ group.title }}</strong>
                  <span
                    class="wm2-picker-count wm2-tabular"
                    :class="{'is-active': groupSelectedCount(group.items) > 0}"
                    >{{
                      t('notePicker.groupSelected', {
                        selected: groupSelectedCount(group.items),
                        total: group.items.length,
                      })
                    }}</span
                  >
                </button>
              </div>
              <template v-if="expandedGroups.has(group.title)">
                <WmTooltip
                  v-for="note in group.items"
                  :key="note.path"
                  :content="note.path"
                  side="top"
                >
                  <label class="wm2-picker-row is-note" :class="{'is-selected': selected.has(note.path)}">
                    <input
                      class="wm2-checkbox"
                      type="checkbox"
                      :checked="selected.has(note.path)"
                      @change="toggle(note.path)"
                    />
                    <DocumentTextIcon class="wm-icon" />
                    <span class="wm2-picker-note-title wm2-truncate">{{ note.title }}</span>
                    <small class="wm2-picker-path wm2-truncate">{{ note.path }}</small>
                  </label>
                </WmTooltip>
              </template>
            </template>
            <div v-if="!groups.length && loading" class="wm2-empty is-compact">
              <span class="wm2-spinner"></span>
            </div>
            <div v-else-if="!groups.length" class="wm2-empty is-compact">
              <DocumentTextIcon class="wm2-empty-icon" />
              <p>{{ t('mention.empty') }}</p>
              <button v-if="query" class="wm2-btn is-ghost is-xs" type="button" @click="query = ''">
                <XMarkIcon class="wm-icon" />
                {{ t('chat.clear') }}
              </button>
            </div>
          </div>

          <footer class="wm2-dialog-actions">
            <span class="wm2-muted wm2-tabular wm2-dialog-actions-start" aria-live="polite">{{
              t('notePicker.selectedCount', {count: selected.size})
            }}</span>
            <DialogClose class="wm2-btn is-ghost is-sm" type="button">
              <XMarkIcon class="wm-icon" />
              {{ t('notePicker.cancel') }}
            </DialogClose>
            <button
              class="wm2-btn is-primary is-sm"
              type="button"
              :disabled="loading && !notes.length"
              @click="confirm"
            >
              <CheckIcon class="wm-icon" />
              {{ t('notePicker.confirm') }}
              <span v-if="selected.size" :key="selected.size" class="wm2-btn-count wm2-tabular">{{
                selected.size
              }}</span>
            </button>
          </footer>
        </DialogContent>
      </DialogOverlay>
    </DialogPortal>
  </DialogRoot>
</template>
