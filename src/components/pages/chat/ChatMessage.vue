<script setup lang="ts">
  import {computed} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowDownTrayIcon,
    ArrowPathIcon,
    BookmarkSquareIcon,
    CheckIcon,
    ClipboardDocumentIcon,
    CloudIcon,
    DocumentTextIcon,
    PencilSquareIcon,
  } from '@heroicons/vue/24/outline';
  import {Notice} from 'obsidian';

  import {usePlugin} from '../../../composables/usePlugin';
  import type {ChatCitation} from '../../../types';
  import WmLogo from '../../shell/WmLogo.vue';
  import StreamingMarkdownView from '../../StreamingMarkdownView.vue';
  import WmTooltip from '../../WmTooltip.vue';

  import type {ChatMessage, MentionTextSegment} from './types';

  const props = defineProps<{
    message: ChatMessage;
    /** True while this assistant reply is still streaming in. */
    streaming: boolean;
    /** Shows the regenerate button on the latest assistant reply. */
    latest: boolean;
    loading: boolean;
    saving: boolean;
    modelLabel: string;
    tokenize: (text: string) => MentionTextSegment[];
    referenceTitle: (path: string) => string;
    isFlashing: (key: string) => boolean;
  }>();

  const emit = defineEmits<{
    copy: [message: ChatMessage];
    insert: [message: ChatMessage];
    saveNote: [message: ChatMessage];
    makeCards: [message: ChatMessage];
    regenerate: [];
    openNote: [path: string];
  }>();

  const {t} = useI18n();
  const plugin = usePlugin();

  const copyKey = computed(() => `copy:${props.message.id}`);
  const insertKey = computed(() => `insert:${props.message.id}`);

  // Vault citations open the note; WiseMindAI citations open the source in the desktop app.
  const openCitation = (citation: ChatCitation) => {
    if (citation.path && plugin.app.vault.getAbstractFileByPath(citation.path)) {
      emit('openNote', citation.path);
      return;
    }
    const type = citation.sourceType === 'knowledge-document' || citation.sourceType === 'note' ? citation.sourceType : 'file';
    void plugin.api
      .openSource({type, id: citation.id, title: citation.title, knowledgeBaseId: citation.knowledgeBaseId})
      .catch(error => new Notice((error as Error)?.message || t('searchPage.openWiseMindFailed')));
  };

  const formatMessageTime = (time: number) =>
    new Date(time).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
</script>

<template>
  <div v-if="message.role === 'user'" class="wm2-chat-user">
    <div class="wm2-chat-bubble">
      <template v-for="(segment, index) in tokenize(message.content)" :key="index">
        <span v-if="segment.type === 'mention'" class="wm2-chat-mention" :title="segment.path">
          {{ segment.title }}
        </span>
        <template v-else>{{ segment.text }}</template>
      </template>
    </div>
    <div class="wm2-chat-user-meta">
      <span class="wm2-tabular">{{ formatMessageTime(message.createdAt) }}</span>
      <WmTooltip :content="isFlashing(copyKey) ? t('shared.copied') : t('chat.copy')">
        <button
          class="wm2-icon-btn is-sm wm2-copy-btn"
          :class="{'is-done': isFlashing(copyKey)}"
          type="button"
          @click="emit('copy', message)"
        >
          <template v-if="isFlashing(copyKey)">
            <CheckIcon class="wm-icon" />
            <span aria-live="polite">{{ t('shared.copied') }}</span>
          </template>
          <template v-else>
            <span class="wm-visually-hidden">{{ t('chat.copy') }}</span>
            <ClipboardDocumentIcon class="wm-icon" />
          </template>
        </button>
      </WmTooltip>
      <WmTooltip :content="isFlashing(insertKey) ? t('shared.inserted') : t('chat.insertNote')">
        <button
          class="wm2-icon-btn is-sm wm2-copy-btn"
          :class="{'is-done': isFlashing(insertKey)}"
          type="button"
          @click="emit('insert', message)"
        >
          <span class="wm-visually-hidden">{{
            isFlashing(insertKey) ? t('shared.inserted') : t('chat.insertNote')
          }}</span>
          <CheckIcon v-if="isFlashing(insertKey)" class="wm-icon" />
          <ArrowDownTrayIcon v-else class="wm-icon" />
        </button>
      </WmTooltip>
    </div>
  </div>

  <article v-else class="wm2-chat-answer">
    <div class="wm2-chat-meta">
      <WmLogo class="wm2-chat-logo" />
      <span class="wm2-truncate" :title="message.model || modelLabel">{{
        message.model || modelLabel
      }}</span>
      <template v-if="message.referencePaths?.length">
        <span aria-hidden="true">·</span>
        <span class="wm2-chat-meta-refs">
          {{ t('chat.referenceCount', {count: message.referencePaths.length}) }}
        </span>
      </template>
      <span class="wm2-chat-meta-time wm2-tabular">{{ formatMessageTime(message.createdAt) }}</span>
    </div>
    <div class="wm2-card wm2-chat-answer-card" :class="{'wm2-stream-caret': streaming && message.content}">
      <StreamingMarkdownView
        :content="message.content"
        :streaming="streaming"
        :placeholder="t('chat.thinking')"
      />
      <section
        v-if="message.referencePaths?.length || message.citations?.length"
        class="wm2-chat-sources-block"
      >
        <div class="wm2-chat-sources-label">{{ t('chat.referenceSources') }}</div>
        <ol v-if="message.referencePaths?.length" class="wm2-chat-sources">
          <li v-for="(path, index) in message.referencePaths" :key="path">
            <button
              class="wm2-plain-button wm2-chat-source"
              type="button"
              :title="path"
              @click="emit('openNote', path)"
            >
              <span class="wm2-chip" :class="index === 0 ? 'is-success' : 'is-info'">{{ index + 1 }}</span>
              <DocumentTextIcon class="wm-icon" />
              <span class="wm2-truncate">{{ referenceTitle(path) }}</span>
            </button>
          </li>
        </ol>
        <ol v-if="message.citations?.length" class="wm2-chat-sources">
          <li v-for="(citation, index) in message.citations" :key="`${citation.sourceType}-${citation.id}-${index}`">
            <button
              class="wm2-plain-button wm2-chat-source"
              type="button"
              :title="citation.snippet || citation.title"
              @click="openCitation(citation)"
            >
              <span class="wm2-chip is-warning">{{ citation.index || index + 1 }}</span>
              <CloudIcon v-if="!citation.path" class="wm-icon" />
              <DocumentTextIcon v-else class="wm-icon" />
              <span class="wm2-truncate">{{ citation.title }}</span>
            </button>
          </li>
        </ol>
      </section>
    </div>
    <div v-if="!streaming" class="wm2-chat-actions">
      <WmTooltip :content="isFlashing(copyKey) ? t('shared.copied') : t('chat.copy')">
        <button
          class="wm2-icon-btn is-sm wm2-copy-btn"
          :class="{'is-done': isFlashing(copyKey)}"
          type="button"
          @click="emit('copy', message)"
        >
          <template v-if="isFlashing(copyKey)">
            <CheckIcon class="wm-icon" />
            <span aria-live="polite">{{ t('shared.copied') }}</span>
          </template>
          <template v-else>
            <span class="wm-visually-hidden">{{ t('chat.copy') }}</span>
            <ClipboardDocumentIcon class="wm-icon" />
          </template>
        </button>
      </WmTooltip>
      <button
        class="wm2-btn is-ghost is-xs"
        :class="{'wm2-flash-done': isFlashing(insertKey)}"
        type="button"
        @click="emit('insert', message)"
      >
        <CheckIcon v-if="isFlashing(insertKey)" class="wm-icon" />
        <ArrowDownTrayIcon v-else class="wm-icon" />
        <span aria-live="polite">{{
          isFlashing(insertKey) ? t('shared.inserted') : t('chat.insertNote')
        }}</span>
      </button>
      <button
        class="wm2-btn is-ghost is-xs"
        type="button"
        :disabled="saving"
        @click="emit('saveNote', message)"
      >
        <span v-if="saving" class="wm2-spinner"></span>
        <PencilSquareIcon v-else class="wm-icon" />
        {{ t('chat.newNote') }}
      </button>
      <button class="wm2-btn is-ghost is-xs" type="button" @click="emit('makeCards', message)">
        <BookmarkSquareIcon class="wm-icon" />
        {{ t('chat.makeCards') }}
      </button>
      <WmTooltip v-if="latest" :content="t('chat.regenerate')">
        <button
          class="wm2-icon-btn is-sm wm2-chat-regenerate"
          type="button"
          :disabled="loading"
          @click="emit('regenerate')"
        >
          <span class="wm-visually-hidden">{{ t('chat.regenerate') }}</span>
          <ArrowPathIcon class="wm-icon" />
        </button>
      </WmTooltip>
    </div>
  </article>
</template>
