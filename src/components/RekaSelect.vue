<script setup lang="ts" generic="T extends string | string[] = string">
  import {computed} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {CheckIcon, ChevronDownIcon} from '@heroicons/vue/24/outline';
  import {
    type AcceptableValue,
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
    modelValue: T;
    options: Array<{value: string; label: string; disabled?: boolean}>;
    placeholder?: string;
    /** When true, selection is kept as an array and the menu stays open for multi-pick. */
    multiple?: boolean;
  }>();

  const emit = defineEmits<{
    'update:modelValue': [value: T];
  }>();

  const {t} = useI18n();
  const isMultiple = computed(() => props.multiple || Array.isArray(props.modelValue));
  // Cast through AcceptableValue so vue-tsc accepts the generic model against reka-ui's SelectRoot.
  const selectValue = computed(
    () => props.modelValue as unknown as AcceptableValue | AcceptableValue[],
  );

  const onUpdate = (value: AcceptableValue | AcceptableValue[] | undefined | null) => {
    if (isMultiple.value) {
      const next = (Array.isArray(value) ? value : []).map(item => String(item));
      emit('update:modelValue', next as T);
      return;
    }
    emit('update:modelValue', String(value ?? '') as T);
  };
</script>

<template>
  <SelectRoot
    :model-value="selectValue"
    :multiple="isMultiple"
    @update:model-value="onUpdate"
  >
    <SelectTrigger class="wm2-select-trigger" :aria-label="placeholder || t('common.select')">
      <SelectValue :placeholder="placeholder || t('common.select')" />
      <ChevronDownIcon class="wm-icon" />
    </SelectTrigger>
    <SelectPortal>
      <SelectContent class="wm2-popover" position="popper" :side-offset="6" :collision-padding="8">
        <SelectViewport class="wm2-popover-viewport">
          <SelectItem
            v-for="option in options"
            :key="option.value"
            class="wm2-menu-item"
            :value="option.value"
            :disabled="option.disabled"
          >
            <SelectItemText>{{ option.label }}</SelectItemText>
            <SelectItemIndicator class="wm2-menu-check">
              <CheckIcon class="wm-icon" />
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
