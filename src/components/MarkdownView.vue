<script setup lang="ts">
import {onBeforeUnmount, ref, watch} from 'vue';

import {usePlugin} from '../composables/usePlugin';
import {createMarkdownRenderScheduler} from '../services/markdownRender';

const props = defineProps<{
  markdown: string;
  sourcePath?: string;
}>();

const plugin = usePlugin();
const root = ref<HTMLElement | null>(null);
const scheduler = createMarkdownRenderScheduler(plugin);

watch(
  () => [root.value, props.markdown, props.sourcePath] as const,
  ([el, markdown, sourcePath]) => {
    if (el) scheduler.schedule(el, markdown, sourcePath || '', false);
  },
  {immediate: true, flush: 'post'},
);

onBeforeUnmount(() => scheduler.dispose());
</script>

<template>
  <div ref="root" class="wm-markdown markdown-rendered"></div>
</template>
