<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { CheckIcon, ChevronDownIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/outline';
import {
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui';

const props = defineProps<{
  modelValue: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disablePortal?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const { t } = useI18n();
const open = ref(false);
const query = ref('');
const searchInput = ref<HTMLInputElement | null>(null);
const emptyValue = '__wisemind_empty_select_value__';

const toSelectValue = (value: string) => (value === '' ? emptyValue : value);
const fromSelectValue = (value: string) => (value === emptyValue ? '' : value);

const selectedLabel = computed(
  () => props.options.find(option => option.value === props.modelValue)?.label || '',
);

const selectModelValue = computed(() => toSelectValue(props.modelValue));

const filteredOptions = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  if (!keyword) return props.options;
  return props.options.filter(option =>
    `${option.label} ${option.value}`.toLowerCase().includes(keyword),
  );
});

watch(open, value => {
  if (value) query.value = '';
});

const enabledOptionElements = () =>
  Array.from(
    searchInput.value
      ?.closest('.wm2-search-select')
      ?.querySelectorAll<HTMLElement>('[role="option"]:not([data-disabled])') || [],
  );

const pick = (value: string) => {
  emit('update:modelValue', value);
  open.value = false;
};

// Arrow keys hand focus to the list (reka-ui takes over from there); Enter picks the first match;
// Escape clears the query first and only closes the popover when it is already empty.
const onSearchKeydown = (event: KeyboardEvent) => {
  if (event.isComposing || event.keyCode === 229) {
    event.stopPropagation();
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    const items = enabledOptionElements();
    (event.key === 'ArrowDown' ? items[0] : items[items.length - 1])?.focus();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    const first = filteredOptions.value.find(option => !option.disabled);
    if (first) pick(first.value);
    return;
  }
  if (event.key === 'Escape' && !query.value) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    query.value = '';
  }
  event.stopPropagation();
};

// Typing while an option is focused goes to the search box instead of reka-ui's typeahead.
const onContentKeydown = (event: KeyboardEvent) => {
  if (event.target === searchInput.value) return;
  const isTextKey = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
  if (!isTextKey && event.key !== 'Backspace') return;
  if (event.key === ' ' && !query.value) return;
  event.preventDefault();
  event.stopPropagation();
  query.value = event.key === 'Backspace' ? query.value.slice(0, -1) : query.value + event.key;
  void nextTick(() => searchInput.value?.focus());
};
</script>

<template>
  <SelectRoot
    :model-value="selectModelValue"
    v-model:open="open"
    @update:model-value="value => emit('update:modelValue', fromSelectValue(String(value)))"
  >
    <SelectTrigger class="wm2-select-trigger" :aria-label="placeholder || t('shared.select')">
      <SelectValue :placeholder="placeholder || t('shared.pleaseSelect')">
        {{ selectedLabel || placeholder || t('shared.pleaseSelect') }}
      </SelectValue>
      <ChevronDownIcon class="wm-icon" />
    </SelectTrigger>
    <SelectPortal :disabled="disablePortal">
      <SelectContent
        class="wm2-popover wm2-search-select"
        position="popper"
        :side-offset="6"
        :collision-padding="8"
        :disable-outside-pointer-events="false"
        @keydown.capture="onContentKeydown"
      >
        <SelectViewport class="wm2-popover-viewport wm2-search-select-viewport">
          <SelectItem
            v-for="option in filteredOptions"
            :key="option.value"
            class="wm2-menu-item"
            :value="toSelectValue(option.value)"
            :disabled="option.disabled"
            :text-value="option.label"
          >
            <SelectItemText>{{ option.label }}</SelectItemText>
            <SelectItemIndicator class="wm2-menu-check">
              <CheckIcon class="wm-icon" />
            </SelectItemIndicator>
          </SelectItem>
          <div v-if="!filteredOptions.length" class="wm2-menu-empty">
            {{ emptyText || t('shared.noMatches') }}
          </div>
        </SelectViewport>
        <div class="wm2-search-select-footer">
          <label class="wm2-search-field is-sm">
            <MagnifyingGlassIcon class="wm-icon" />
            <input
              ref="searchInput"
              v-model="query"
              type="text"
              :placeholder="searchPlaceholder || t('shared.searchFolder')"
              :aria-label="searchPlaceholder || t('shared.searchFolder')"
              @click.stop
              @pointerdown.stop
              @keydown="onSearchKeydown"
            />
          </label>
        </div>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
