<script setup lang="ts">
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

const options = [
  { mode: 'current' as const, label: '当前笔记', icon: DocumentTextIcon },
  { mode: 'selection' as const, label: '选中文本', icon: CheckCircleIcon },
  { mode: 'multi' as const, label: '多篇笔记', icon: FolderOpenIcon },
];
</script>

<template>
  <ToggleGroupRoot
    :model-value="modelValue"
    class="wm-source-selector"
    type="single"
    @update:model-value="value => value && emit('update:modelValue', value as SourceMode)"
  >
    <ToggleGroupItem
      v-for="option in options"
      :key="option.mode"
      :value="option.mode"
      class="wm-source-button"
      :class="{ 'is-active': modelValue === option.mode }"
      @click="option.mode === 'multi' ? emit('pickMulti') : emit('update:modelValue', option.mode)"
    >
      <component :is="option.icon" class="wm-icon" />
      <span>{{ option.label }}</span>
      <small v-if="option.mode === 'multi' && multiCount">{{ multiCount }}</small>
    </ToggleGroupItem>
  </ToggleGroupRoot>
</template>
