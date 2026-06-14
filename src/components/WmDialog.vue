<script setup lang="ts">
  import {useI18n} from 'vue-i18n';
  import {
    DialogClose,
    DialogContent,
    DialogOverlay,
    DialogPortal,
    DialogRoot,
    DialogTitle,
  } from 'reka-ui';

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
      <DialogOverlay class="wm-modal-overlay">
        <DialogContent class="wm-modal-box" :class="contentClass">
          <header class="wm-dialog-header">
            <div class="wm:grid wm:min-w-0 wm:gap-1 wm:pr-10">
              <DialogTitle class="wm-dialog-title">{{ title }}</DialogTitle>
              <p v-if="description" class="wm-muted wm:m-0">{{ description }}</p>
            </div>
            <DialogClose
              class="btn btn-sm btn-circle btn-ghost absolute right-4 top-4"
              :aria-label="t('dialog.close')"
              type="button"
              >✕</DialogClose
            >
          </header>

          <slot></slot>
        </DialogContent>
      </DialogOverlay>
    </DialogPortal>
  </DialogRoot>
</template>
