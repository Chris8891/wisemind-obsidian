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
    class="wm2-segmented wm2-source-seg"
    type="single"
    @update:model-value="value => value && emit('update:modelValue', value as SourceMode)"
  >
    <ToggleGroupItem
      v-for="option in options"
      :key="option.mode"
      :value="option.mode"
      :class="{'is-active': modelValue === option.mode}"
      @click="option.mode === 'multi' ? emit('pickMulti') : emit('update:modelValue', option.mode)"
    >
      <component :is="option.icon" class="wm-icon" />
      <span class="wm2-truncate">{{ t(option.labelKey) }}</span>
      <span v-if="option.mode === 'multi' && multiCount" class="wm2-badge wm2-tabular">{{
        multiCount
      }}</span>
    </ToggleGroupItem>
  </ToggleGroupRoot>
</template>
