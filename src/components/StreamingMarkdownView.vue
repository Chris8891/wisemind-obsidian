<script setup lang="ts">
  import {onBeforeUnmount, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';

  import {usePlugin} from '../composables/usePlugin';
  import {createMarkdownRenderScheduler} from '../services/markdownRender';

  const props = withDefaults(
    defineProps<{
      content?: string;
      streaming?: boolean;
      placeholder?: string;
      sourcePath?: string;
    }>(),
    {
      content: '',
      streaming: false,
      placeholder: '',
      sourcePath: '',
    },
  );

  const {t} = useI18n();
  const plugin = usePlugin();
  const root = ref<HTMLElement | null>(null);
  const scheduler = createMarkdownRenderScheduler(plugin);

  watch(
    () => [root.value, props.content, props.streaming, props.sourcePath] as const,
    ([el, content, streaming, sourcePath]) => {
      if (!el) return;
      scheduler.schedule(el, content, sourcePath, streaming);
    },
    {immediate: true, flush: 'post'},
  );

  onBeforeUnmount(() => scheduler.dispose());
</script>

<template>
  <div class="wm:min-w-0 wm:text-sm wm:leading-6">
    <div
      v-if="props.streaming && !props.content.trim()"
      class="wm:flex wm:items-center wm:gap-2 wm:py-1 wm:text-[var(--text-muted)]"
    >
      <span class="wm-loading-spinner"></span>
      <span>{{ props.placeholder || t('shared.generating') }}</span>
    </div>
    <div v-show="props.content.trim()" ref="root" class="wm-markdown markdown-rendered"></div>
  </div>
</template>
