<script setup lang="ts">
  import {useI18n} from 'vue-i18n';
  import {ChevronDownIcon} from '@heroicons/vue/24/outline';
  import {
    SelectContent,
    SelectItem,
    SelectItemText,
    SelectPortal,
    SelectRoot,
    SelectTrigger,
    SelectValue,
    SelectViewport,
  } from 'reka-ui';

  defineProps<{
    modelValue: string;
    options: Array<{value: string; label: string; disabled?: boolean}>;
    placeholder?: string;
  }>();

  const emit = defineEmits<{
    'update:modelValue': [value: string];
  }>();

  const {t} = useI18n();
</script>

<template>
  <SelectRoot
    :model-value="modelValue"
    @update:model-value="value => emit('update:modelValue', String(value))"
  >
    <SelectTrigger class="wm-select-trigger" :aria-label="placeholder || t('common.select')">
      <SelectValue :placeholder="placeholder || t('common.select')" />
      <ChevronDownIcon class="wm-icon" />
    </SelectTrigger>
    <SelectPortal>
      <SelectContent class="wm-select-content" position="popper" :side-offset="4">
        <SelectViewport class="wm-select-viewport">
          <SelectItem
            v-for="option in options"
            :key="option.value"
            class="wm-select-item"
            :value="option.value"
            :disabled="option.disabled"
          >
            <SelectItemText>{{ option.label }}</SelectItemText>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
