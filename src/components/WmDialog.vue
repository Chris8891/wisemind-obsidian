<script setup lang="ts">
  import {useI18n} from 'vue-i18n';
  import {
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogOverlay,
    DialogPortal,
    DialogRoot,
    DialogTitle,
  } from 'reka-ui';

  import {focusDialogInitial} from '../composables/dialogFocus';

  withDefaults(
    defineProps<{
      open: boolean;
      title: string;
      description?: string;
      contentClass?: string;
    }>(),
    {
      description: '',
      contentClass: '',
    },
  );

  const emit = defineEmits<{
    'update:open': [value: boolean];
  }>();

  const {t} = useI18n();
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal to="#wisemindai-obsidian-root">
      <DialogOverlay class="wm2-dialog-overlay">
        <DialogContent
          class="wm2-dialog"
          :class="contentClass"
          v-bind="description ? {} : {'aria-describedby': undefined}"
          @open-auto-focus="focusDialogInitial"
        >
          <header class="wm2-dialog-header">
            <DialogTitle class="wm2-dialog-title">{{ title }}</DialogTitle>
            <DialogDescription v-if="description" as="p" class="wm2-dialog-desc">{{
              description
            }}</DialogDescription>
            <DialogClose class="wm2-dialog-close" :aria-label="t('dialog.close')" type="button"
              >✕</DialogClose
            >
          </header>

          <slot></slot>
        </DialogContent>
      </DialogOverlay>
    </DialogPortal>
  </DialogRoot>
</template>
