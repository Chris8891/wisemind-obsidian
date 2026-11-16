<script setup lang="ts">
  import {nextTick, onMounted, onUnmounted, ref, watch} from 'vue';

  import NotePickerDialog from '../NotePickerDialog.vue';
  import WiseMindConnectionDialog from '../WiseMindConnectionDialog.vue';

  import ChatComposer from './chat/ChatComposer.vue';
  import ChatHeader from './chat/ChatHeader.vue';
  import ChatHistoryDialog from './chat/ChatHistoryDialog.vue';
  import ChatMessageList from './chat/ChatMessageList.vue';
  import {useChatComposer} from './chat/useChatComposer';
  import {useChatContext, useChatNoteIndex, useOpenNote} from './chat/useChatContext';
  import {useChatDrafts} from './chat/useChatDrafts';
  import {useChatRuns} from './chat/useChatRuns';
  import {useChatSessions} from './chat/useChatSessions';
  import {useChatStream} from './chat/useChatStream';

  const props = defineProps<{
    /** True while the chat view is the visible view; used to focus the composer when it opens. */
    active?: boolean;
    historyItemId?: string;
    historyToken?: number;
    draftMessage?: string;
    draftToken?: number;
    draftAutoSend?: boolean;
    draftNewSession?: boolean;
  }>();
  const emit = defineEmits<{
    draftConsumed: [token: number];
  }>();

  const openNote = useOpenNote();
  const noteIndex = useChatNoteIndex();
  const runs = useChatRuns();
  const composer = useChatComposer({
    noteIndex,
    syncDraft: () => sessions.syncActiveDraftInput(),
    schedulePersist: () => sessions.schedulePersistOpenSessionIds(),
    submit: () => void stream.send(),
  });
  const {input, setComposerInput, focusComposer} = composer;
  const sessions = useChatSessions({
    runs,
    input,
    setComposerInput,
    onLoaded: () => void drafts.flushPendingDraft(),
  });
  const {sessions: openSessions, activeSessionId, activeSession, draftInputs} = sessions;
  const context = useChatContext({
    noteIndex,
    activeSession,
    persistSessions: sessions.persistSessions,
  });
  const {notePickerOpen, selectedNotesOpen, activeContextPaths} = context;
  const messageList = ref<InstanceType<typeof ChatMessageList> | null>(null);
  // Immediate watchers run before the list mounts, so defer the scroll until it exists.
  const scrollMessagesToBottom = (force = true) => {
    if (messageList.value) void messageList.value.scrollToBottom(force);
    else void nextTick(() => messageList.value?.scrollToBottom(force));
  };
  const stream = useChatStream({
    runs,
    sessions,
    noteIndex,
    input,
    setComposerInput,
    scrollToBottom: scrollMessagesToBottom,
  });
  const {error, modelLabel, connectionDialogOpen, activeSessionLoading, canSend} = stream;
  const drafts = useChatDrafts({
    sessions,
    setComposerInput,
    send: stream.send,
    onConsumed: token => emit('draftConsumed', token),
  });
  const historyDialogOpen = ref(false);

  const createSessionAndFocus = () => {
    sessions.createSession();
    focusComposer();
  };

  const openHistoryItem = async (id?: string) => {
    const session = sessions.activateHistoryItem(id);
    if (!session) return;
    historyDialogOpen.value = false;
    if (session.contextPath) await openNote(session.contextPath);
  };

  onMounted(async () => {
    await noteIndex.refresh();
    sessions.loadSessionsFromSettings();
    void openHistoryItem(props.historyItemId);
    await stream.loadModelLabel();
  });

  onUnmounted(() => {
    runs.abortAll();
    sessions.persistNow();
  });

  watch(
    () => props.historyToken,
    () => void openHistoryItem(props.historyItemId),
    {immediate: true},
  );

  watch(
    activeSessionId,
    (nextId, previousId) => {
      if (sessions.suppressSessionSwitchSync.value) return;
      if (previousId) draftInputs.value[previousId] = input.value;
      error.value = '';
      setComposerInput(nextId ? draftInputs.value[nextId] || '' : '');
      scrollMessagesToBottom();
      sessions.schedulePersistOpenSessionIds();
    },
    {flush: 'post'},
  );

  // Opening the chat view puts the caret in the composer; a draft applied at the same time focuses it too.
  watch(
    () => props.active,
    active => {
      if (!active) return;
      focusComposer();
      scrollMessagesToBottom(false);
    },
    {immediate: true, flush: 'post'},
  );

  watch(
    () => props.draftToken,
    token => {
      if (!token) return;
      void drafts.applyDraftMessage(
        props.draftMessage,
        props.draftAutoSend,
        props.draftNewSession,
        token,
      );
    },
    {immediate: true, flush: 'post'},
  );
</script>

<template>
  <section class="wm2-chat">
    <ChatHeader
      :sessions="openSessions"
      :active-session-id="activeSessionId"
      :active-title="activeSession?.title"
      :loading="activeSessionLoading"
      :saved-count="sessions.savedChatSessions.value.length"
      :is-session-loading="runs.isSessionLoading"
      @switch="sessions.activeSessionId.value = $event"
      @close="sessions.closeSession"
      @create="sessions.createSession()"
      @create-and-focus="createSessionAndFocus"
      @open-history="historyDialogOpen = true"
      @close-all="sessions.clearAll"
      @focus-composer="focusComposer"
    />

    <ChatMessageList
      ref="messageList"
      :session="activeSession"
      :loading="activeSessionLoading"
      :streaming-message-id="activeSession ? runs.streamingMessageIds.value[activeSession.id] : undefined"
      :model-label="modelLabel"
      :tokenize="noteIndex.tokenize"
      :reference-title="noteIndex.referenceTitle"
      @regenerate="stream.regenerate"
      @send-prompt="stream.sendPrompt"
      @empty-prompt="setComposerInput($event, {focus: true})"
    />

    <p v-if="error" class="wm2-chat-error" role="alert">{{ error }}</p>

    <ChatComposer
      v-model:selected-notes-open="selectedNotesOpen"
      :composer="composer"
      :context-paths="activeContextPaths"
      :context-notes="context.selectedContextNotes.value"
      :loading="activeSessionLoading"
      :can-send="canSend"
      :can-clear="Boolean(activeSession?.messages.length) && !activeSessionLoading"
      :model-label="modelLabel"
      :reference-title="noteIndex.referenceTitle"
      @clear-context="context.setActiveContextPath('')"
      @use-current-note="context.attachActiveNoteAsContext"
      @choose-notes="context.notePickerOpen.value = true"
      @remove-context-path="context.removeActiveContextPath"
      @clear-messages="sessions.clearActiveSession"
      @send="stream.send"
      @stop="stream.stop"
    />

    <NotePickerDialog
      v-model:open="notePickerOpen"
      :selected-paths="activeContextPaths"
      @confirm="context.setActiveContextNotes"
    />
    <WiseMindConnectionDialog v-model:open="connectionDialogOpen" />

    <ChatHistoryDialog
      v-model:open="historyDialogOpen"
      :sessions="sessions.savedChatSessions.value"
      @select="openHistoryItem"
      @delete="sessions.deleteHistoryItem"
    />
  </section>
</template>
