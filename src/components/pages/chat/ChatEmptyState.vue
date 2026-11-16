<script setup lang="ts">
  import {computed} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {ChatBubbleOvalLeftEllipsisIcon} from '@heroicons/vue/24/outline';

  const emit = defineEmits<{
    /** Puts a starter prompt into the composer. */
    prompt: [text: string];
  }>();

  const {t} = useI18n();

  const emptyPrompts = computed(() => [
    {label: t('chat.summarize'), prompt: t('chat.promptSummary')},
    {label: t('chat.extract'), prompt: t('chat.promptExtract')},
    {label: t('chat.questions'), prompt: t('chat.promptQuestions')},
  ]);
</script>

<template>
  <div class="wm2-empty wm2-chat-empty">
    <span class="wm2-tile"><ChatBubbleOvalLeftEllipsisIcon class="wm-icon" /></span>
    <p class="wm2-chat-empty-title">{{ t('chat.emptyGreeting') }}</p>
    <button class="wm2-btn is-sm" type="button" @click="emit('prompt', t('chat.promptAsk'))">
      {{ t('chat.askSomething') }}
    </button>
    <div class="wm2-row wm2-chips wm2-center">
      <button
        v-for="item in emptyPrompts"
        :key="item.label"
        class="wm2-chip"
        type="button"
        @click="emit('prompt', item.prompt)"
      >
        {{ item.label }}
      </button>
    </div>
  </div>
</template>
