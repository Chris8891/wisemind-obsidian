import {computed, type Ref, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import type {TFile} from 'obsidian';

import {usePlugin} from '../../../composables/usePlugin';
import {useWiseMindConnectionGuard} from '../../../composables/useWiseMindConnectionGuard';
import {FEATURES} from '../../../features';
import {resolveLanguageSetting} from '../../../i18n';
import {hasFeature} from '../../../services/capabilities';
import type {ChatCitation} from '../../../types';

import type {ChatMessage, ChatSession, ComposerInputOptions} from './types';
import {type ChatNoteIndex, sessionContextPaths} from './useChatContext';
import type {ChatRuns} from './useChatRuns';
import type {ChatSessions} from './useChatSessions';

const HISTORY_MESSAGE_LIMIT = 12;
const CITATION_LIMIT = 8;

const normalizeCitations = (raw: unknown): ChatCitation[] =>
  (Array.isArray(raw) ? raw : [])
    .filter(item => item && typeof item === 'object')
    .slice(0, CITATION_LIMIT)
    .map((item: Record<string, any>, index) => ({
      index: Number(item.index) || index + 1,
      sourceType: item.sourceType || item.type ? String(item.sourceType || item.type) : undefined,
      id: item.id ?? undefined,
      title: String(item.title || item.name || item.path || '').trim(),
      path: item.path ? String(item.path) : undefined,
      snippet: item.snippet ? String(item.snippet).slice(0, 200) : undefined,
      knowledgeBaseId: item.knowledgeBaseId ?? undefined,
    }))
    .filter(item => item.title);

// A reply that ended without content is removed; a regenerated reply falls back to the previous answer.
const settleEmptyAnswer = (session: ChatSession, assistantId: string, fallback?: ChatMessage) => {
  const index = session.messages.findIndex(item => item.id === assistantId);
  if (index !== -1 && session.messages[index].content.trim()) return;
  if (index !== -1) session.messages.splice(index, 1);
  if (!fallback || session.messages.some(item => item.id === fallback.id)) return;
  if (index !== -1) {
    session.messages.splice(index, 0, fallback);
  } else if (session.messages[session.messages.length - 1]?.role === 'user') {
    session.messages.push(fallback);
  }
};

/** Sending, streaming, regenerating and stopping replies, one run per session. */
export const useChatStream = (options: {
  runs: ChatRuns;
  sessions: ChatSessions;
  noteIndex: ChatNoteIndex;
  input: Ref<string>;
  setComposerInput: (value: string, opts?: ComposerInputOptions) => void;
  /** Scrolls the message list to the end; `force` resumes following the latest message. */
  scrollToBottom: (force?: boolean) => void;
}) => {
  const {runs, sessions, noteIndex, input, setComposerInput, scrollToBottom} = options;
  const plugin = usePlugin();
  const {t} = useI18n();
  const {connectionDialogOpen, ensureWiseMindConnected} = useWiseMindConnectionGuard();
  const error = ref('');
  const modelLabel = ref(t('chat.currentModel'));

  const activeSessionLoading = computed(() =>
    runs.isSessionLoading(sessions.activeSessionId.value),
  );
  const canSend = computed(() => Boolean(input.value.trim()) && !activeSessionLoading.value);

  const loadModelLabel = async () => {
    try {
      const result = await plugin.api.getAssistantModel();
      modelLabel.value = result.model || modelLabel.value;
    } catch {
      modelLabel.value = t('chat.modelNotConfigured');
    }
  };

  // Excluded folders and `private: true` notes are never sent to the model.
  const isAllowedPath = (path: string) => {
    const file = path ? plugin.app.vault.getAbstractFileByPath(path) : null;
    return !file || !plugin.isFileExcluded(file as TFile);
  };

  const buildRequestContext = async (session: ChatSession, message: string) => {
    const contextPaths = sessionContextPaths(session).filter(isAllowedPath);
    const currentNote = await noteIndex.buildReference(contextPaths[0] || '');
    const referencePaths = Array.from(
      new Set([...contextPaths.slice(1), ...noteIndex.extractMentionedPaths(message).filter(isAllowedPath)]),
    ).filter(path => path !== currentNote?.path);
    const references = (await Promise.all(referencePaths.map(noteIndex.buildReference))).filter(
      Boolean,
    );
    const history = session.messages
      .slice(0, -1)
      .slice(-HISTORY_MESSAGE_LIMIT)
      .map(item => ({role: item.role, content: item.content}));
    return {currentNote, referencePaths, references, history};
  };

  const streamAnswer = async (
    session: ChatSession,
    message: string,
    previousAnswer?: ChatMessage,
  ) => {
    const controller = new AbortController();
    runs.setSessionController(session.id, controller);
    error.value = '';
    runs.clearStreamingMessageId(session.id);
    const assistantId = `msg-${Date.now()}-assistant`;

    try {
      const {currentNote, referencePaths, references, history} = await buildRequestContext(
        session,
        message,
      );
      if (controller.signal.aborted) return;
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        referencePaths: [currentNote?.path || '', ...referencePaths].filter(Boolean),
      };
      session.messages.push(assistantMessage);
      const findAssistant = (): ChatMessage | undefined =>
        session.messages.find(item => item.id === assistantId);
      runs.setStreamingMessageId(session.id, assistantId);
      scrollToBottom();
      // Batch token updates so Vue + stick-to-bottom are not woken on every chunk.
      const DELTA_FLUSH_MS = 64;
      let pendingDelta = '';
      let deltaTimer = 0;
      const flushDelta = () => {
        deltaTimer = 0;
        if (!pendingDelta) return;
        const target = findAssistant();
        if (target) {
          target.content += pendingDelta;
          session.updatedAt = Date.now();
        }
        pendingDelta = '';
        scrollToBottom(false);
      };
      const result: any = await plugin.api.chatStream(
        {
          message,
          language: resolveLanguageSetting(plugin.settings.assistantDefaults.language),
          currentNote,
          references,
          history,
          ...(hasFeature(FEATURES.chatScope) ? {scope: plugin.settings.chatScope} : {}),
        },
        {
          onDelta: text => {
            pendingDelta += text;
            if (!deltaTimer) deltaTimer = window.setTimeout(flushDelta, DELTA_FLUSH_MS);
          },
        },
        {signal: controller.signal},
      );
      if (deltaTimer) window.clearTimeout(deltaTimer);
      flushDelta();
      const target = findAssistant();
      if (target) {
        target.content = String(result.message || target.content || '').trim();
        if (!target.content) {
          target.content = t('chat.emptyResponse');
        }
        if (result.model) target.model = result.model;
        const citations = normalizeCitations(result.citations);
        if (citations.length) target.citations = citations;
      }
      if (result.model) modelLabel.value = result.model;
    } catch (err: any) {
      if (!controller.signal.aborted && sessions.activeSessionId.value === session.id) {
        error.value = err?.message || t('chat.failed');
      }
    } finally {
      settleEmptyAnswer(session, assistantId, previousAnswer);
      session.updatedAt = Date.now();
      void sessions.persistSessions();
      // A stopped run must not clear the controller of a run started after it.
      if (runs.abortControllers.value[session.id] === controller) {
        runs.clearSessionController(session.id);
      }
      if (runs.streamingMessageIds.value[session.id] === assistantId) {
        runs.clearStreamingMessageId(session.id);
      }
      scrollToBottom(false);
    }
  };

  const submitMessage = async (rawMessage: string, fromComposer: boolean) => {
    const session = sessions.activeSession.value;
    const message = rawMessage.trim();
    if (!session || !message || runs.isSessionLoading(session.id)) return;
    if (!(await ensureWiseMindConnected())) return;
    if (!(await plugin.ensureAiReady())) return;
    // Another send may have started while the connection check was pending.
    if (runs.isSessionLoading(session.id)) return;
    session.messages.push({
      id: `msg-${Date.now()}`,
      role: 'user',
      content: message,
      createdAt: Date.now(),
    });
    session.title = session.messages.length === 1 ? message.slice(0, 18) : session.title;
    session.updatedAt = Date.now();
    if (fromComposer) {
      if (sessions.activeSessionId.value === session.id) setComposerInput('');
      sessions.draftInputs.value[session.id] = '';
    }
    scrollToBottom();
    await streamAnswer(session, message);
  };

  const send = () => submitMessage(input.value, true);

  const sendPrompt = (prompt: string) => submitMessage(prompt, false);

  const regenerate = async () => {
    const session = sessions.activeSession.value;
    if (!session || runs.isSessionLoading(session.id)) return;
    const last = session.messages[session.messages.length - 1];
    const question = session.messages[session.messages.length - 2];
    if (last?.role !== 'assistant' || question?.role !== 'user') return;
    if (!(await ensureWiseMindConnected())) return;
    if (!(await plugin.ensureAiReady())) return;
    // Re-check after the await so a concurrent click can never pop the user's question.
    if (
      runs.isSessionLoading(session.id) ||
      session.messages[session.messages.length - 1]?.id !== last.id
    ) {
      return;
    }
    session.messages.pop();
    await streamAnswer(session, question.content, last);
  };

  const stop = () => {
    const sessionId = sessions.activeSessionId.value;
    if (!sessionId) return;
    runs.abortSession(sessionId);
  };

  return {
    error,
    modelLabel,
    connectionDialogOpen,
    activeSessionLoading,
    canSend,
    loadModelLabel,
    send,
    sendPrompt,
    regenerate,
    stop,
  };
};
