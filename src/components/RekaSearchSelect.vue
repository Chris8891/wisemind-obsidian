<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { CheckIcon, ChevronDownIcon } from '@heroicons/vue/24/outline';
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
</script>

<template>
  <SelectRoot
    :model-value="selectModelValue"
    v-model:open="open"
    @update:model-value="value => emit('update:modelValue', fromSelectValue(String(value)))"
  >
    <SelectTrigger class="wm-select-trigger" :aria-label="placeholder || t('shared.select')">
      <SelectValue :placeholder="placeholder || t('shared.pleaseSelect')">
        {{ selectedLabel || placeholder || t('shared.pleaseSelect') }}
      </SelectValue>
      <ChevronDownIcon class="wm-icon" />
    </SelectTrigger>
    <SelectPortal :disabled="disablePortal">
      <SelectContent
        class="wm-select-content wm-search-select-content"
        position="popper"
        :side-offset="4"
        :disable-outside-pointer-events="false"
      >
        <SelectViewport class="wm-select-viewport wm-search-select-viewport">
          <SelectItem
            v-for="option in filteredOptions"
            :key="option.value"
            class="wm-select-item wm-search-select-item"
            :value="toSelectValue(option.value)"
            :disabled="option.disabled"
            :text-value="option.label"
          >
            <SelectItemText>{{ option.label }}</SelectItemText>
            <SelectItemIndicator class="wm-search-select-indicator">
              <CheckIcon class="wm-icon" />
            </SelectItemIndicator>
          </SelectItem>
          <div v-if="!filteredOptions.length" class="wm-search-select-empty">
            {{ emptyText || t('shared.noMatches') }}
          </div>
        </SelectViewport>
        <div class="wm-search-select-footer">
          <input
            v-model="query"
            class="wm-input"
            :placeholder="searchPlaceholder || t('shared.searchFolder')"
            @click.stop
            @pointerdown.stop
            @keydown.stop
          />
        </div>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
