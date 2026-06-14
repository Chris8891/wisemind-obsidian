<script setup lang="ts">
  import {onBeforeUnmount, onMounted, ref} from 'vue';
  import {useI18n} from 'vue-i18n';
  import MarkdownRender from 'markstream-vue';
  import {Notice} from 'obsidian';

  const props = withDefaults(
    defineProps<{
      content?: string;
      streaming?: boolean;
      placeholder?: string;
    }>(),
    {
      content: '',
      streaming: false,
      placeholder: '',
    },
  );

  const {t} = useI18n();
  const isDark = ref(false);
  let themeObserver: MutationObserver | undefined;

  type MarkstreamCopyEvent = {
    payload?: {
      text?: unknown;
    };
    preventDefault?: () => void;
  };

  const updateTheme = () => {
    const body = document.body;
    isDark.value =
      body.classList.contains('theme-dark') ||
      body.getAttribute('data-theme') === 'dark';
  };

  const handleCopy = async (payload: unknown) => {
    const eventPayload = payload as MarkstreamCopyEvent;
    const text = eventPayload?.payload?.text;
    if (typeof text !== 'string' || !text) return;
    eventPayload.preventDefault?.();
    await globalThis.navigator?.clipboard?.writeText(text);
    new Notice(t('shared.copied'));
  };

  onMounted(() => {
    updateTheme();
    themeObserver = new MutationObserver(updateTheme);
    themeObserver.observe(document.body, {
      attributeFilter: ['class', 'data-theme'],
      attributes: true,
    });
  });

  onBeforeUnmount(() => {
    themeObserver?.disconnect();
  });
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
    <MarkdownRender
      v-else
      custom-id="wisemindai-obsidian"
      :content="props.content"
      :final="!props.streaming"
      :is-dark="isDark"
      html-policy="escape"
      :typewriter="props.streaming"
      smooth-streaming="auto"
      :fade="false"
      :batch-rendering="true"
      :initial-render-batch-size="24"
      :render-batch-size="16"
      :render-batch-delay="8"
      :render-batch-budget-ms="4"
      :code-block-stream="props.streaming"
      :show-tooltips="false"
      @copy="handleCopy"
    />
  </div>
</template>
