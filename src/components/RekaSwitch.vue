<script setup lang="ts">
  import {SwitchRoot, SwitchThumb} from 'reka-ui';

  withDefaults(
    defineProps<{
      modelValue: boolean;
      ariaLabel: string;
      disabled?: boolean;
    }>(),
    {
      disabled: false,
    },
  );

  const emit = defineEmits<{
    'update:modelValue': [value: boolean];
  }>();
</script>

<template>
  <SwitchRoot
    class="wm2-switch"
    :model-value="modelValue"
    :disabled="disabled"
    :aria-label="ariaLabel"
    @update:model-value="value => emit('update:modelValue', Boolean(value))"
  >
    <SwitchThumb class="wm2-switch-thumb" />
  </SwitchRoot>
</template>
