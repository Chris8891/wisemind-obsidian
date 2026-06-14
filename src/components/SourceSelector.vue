<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import { CheckCircleIcon, DocumentTextIcon, FolderOpenIcon } from '@heroicons/vue/24/outline';
import { ToggleGroupItem, ToggleGroupRoot } from 'reka-ui';

import type { SourceMode } from '../services/assistantService';

defineProps<{
  modelValue: SourceMode;
  multiCount: number;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: SourceMode];
  pickMulti: [];
}>();

const {t} = useI18n();
const options = [
  { mode: 'current' as const, labelKey: 'assistant.sourceCurrent', icon: DocumentTextIcon },
  { mode: 'selection' as const, labelKey: 'assistant.sourceSelection', icon: CheckCircleIcon },
  { mode: 'multi' as const, labelKey: 'assistant.sourceMulti', icon: FolderOpenIcon },
];
</script>

<template>
  <ToggleGroupRoot
    :model-value="modelValue"
    class="wm:grid wm:grid-cols-3 wm:gap-2"
    type="single"
    @update:model-value="value => value && emit('update:modelValue', value as SourceMode)"
  >
    <ToggleGroupItem
      v-for="option in options"
      :key="option.mode"
      :value="option.mode"
      class="wm:inline-flex wm:min-h-[38px] wm:items-center wm:justify-center wm:gap-1.5 wm:rounded-lg wm:border wm:border-[var(--background-modifier-border)] wm:bg-[var(--background-primary)] wm:px-2 wm:py-2 wm:text-[var(--text-normal)] wm:transition-colors"
      :class="
        modelValue === option.mode
          ? 'wm:border-[var(--interactive-accent)] wm:bg-[var(--interactive-accent)] wm:text-[var(--text-on-accent)]'
          : ''
      "
      :style="
        modelValue === option.mode
          ? {
              borderColor: 'var(--interactive-accent)',
              backgroundColor: 'var(--interactive-accent)',
              color: 'var(--text-on-accent)',
            }
          : undefined
      "
      @click="option.mode === 'multi' ? emit('pickMulti') : emit('update:modelValue', option.mode)"
    >
      <component :is="option.icon" class="wm-icon" />
      <span class="wm:truncate">{{ t(option.labelKey) }}</span>
      <small v-if="option.mode === 'multi' && multiCount">{{ multiCount }}</small>
    </ToggleGroupItem>
  </ToggleGroupRoot>
</template>
