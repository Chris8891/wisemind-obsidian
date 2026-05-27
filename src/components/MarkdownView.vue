<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { MarkdownRenderer } from 'obsidian';

import { usePlugin } from '../composables/usePlugin';

const props = defineProps<{
  markdown: string;
  sourcePath?: string;
}>();

const plugin = usePlugin();
const root = ref<HTMLElement | null>(null);

const render = async () => {
  await nextTick();
  if (!root.value) return;
  root.value.empty();
  try {
    const renderer = MarkdownRenderer as any;
    const task = typeof renderer.renderMarkdown === 'function'
      ? renderer.renderMarkdown(props.markdown, root.value, props.sourcePath || '', plugin)
      : renderer.render(plugin.app, props.markdown, root.value, props.sourcePath || '', plugin);
    await Promise.resolve(task);
  } catch {
    root.value.textContent = props.markdown;
  }
};

watch(() => [props.markdown, props.sourcePath], () => void render(), { immediate: true });
</script>

<template>
  <div ref="root" class="wm-markdown" ></div>
</template>
