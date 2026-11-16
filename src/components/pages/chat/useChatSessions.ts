import {computed, nextTick, onMounted, onUnmounted, type Ref, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {Notice} from 'obsidian';

import {usePlugin} from '../../../composables/usePlugin';
import {
  notifyTaskHistoryUpdated,
  WISEMIND_TASK_HISTORY_UPDATED_EVENT,
} from '../../../services/taskHistory';
import type {AssistantChatSession, AssistantOpenChatSession} from '../../../types';

import type {ChatSession, ComposerInputOptions} from './types';
import {activeMarkdownFile} from './useChatContext';
import type {ChatRuns} from './useChatRuns';

const MAX_SAVED_SESSIONS = 50;
const MAX_PERSISTED_MESSAGES = 40;
const MAX_PERSISTED_MESSAGE_CHARS = 8_000;
const PERSIST_OPEN_DELAY_MS = 350;

/** Keeps settings.json bounded: trim older turns and cap each message body. */
const thinMessagesForPersist = (messages: ChatSession['messages']): ChatSession['messages'] =>
  messages.slice(-MAX_PERSISTED_MESSAGES).map(message => {
    const content = String(message.content || '');
    if (content.length <= MAX_PERSISTED_MESSAGE_CHARS) return {...message};
    return {...message, content: `${content.slice(0, MAX_PERSISTED_MESSAGE_CHARS)}\n…`};
  });

const toChatSession = (session: AssistantChatSession): ChatSession => ({
  ...session,
  messages: [...(session.messages || [])],
});

/** Open chat tabs, their drafts and the saved history, kept in sync with plugin settings. */
export const useChatSessions = (options: {
  runs: ChatRuns;
  input: Ref<string>;
  setComposerInput: (value: string, opts?: ComposerInputOptions) => void;
  /** Runs after sessions are (re)loaded from settings. */
  onLoaded: () => void;
}) => {
  const {runs, input, setComposerInput, onLoaded} = options;
  const plugin = usePlugin();
  const {t} = useI18n();
  const sessions = ref<ChatSession[]>([]);
  const activeSessionId = ref('');
  const sessionsReady = ref(false);
  const historyRevision = ref(0);
  const draftInputs = ref<Record<string, string>>({});
  const suppressSessionSwitchSync = ref(false);
  let persistOpenTimer: ReturnType<typeof setTimeout> | null = null;
  let skippingOwnHistoryEvent = false;

  const activeSession = computed(
    () => sessions.value.find(item => item.id === activeSessionId.value) || sessions.value[0],
  );
  const savedChatSessions = computed(() => {
    void historyRevision.value;
    return [...(plugin.settings.assistantChatSessions || [])].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  });

  const syncActiveDraftInput = () => {
    if (activeSessionId.value) draftInputs.value[activeSessionId.value] = input.value;
  };

  const notifyHistoryChanged = () => {
    skippingOwnHistoryEvent = true;
    notifyTaskHistoryUpdated();
    skippingOwnHistoryEvent = false;
  };

  const markHistoryChanged = () => {
    historyRevision.value += 1;
    notifyHistoryChanged();
  };

  const buildOpenSessionSnapshots = () =>
    sessions.value.map<AssistantOpenChatSession>(session => ({
      id: session.id,
      title: session.title,
      contextPath: session.contextPath,
      contextPaths: session.contextPaths,
      createdAt: session.createdAt,
      draftInput:
        session.id === activeSessionId.value ? input.value : draftInputs.value[session.id] || '',
      updatedAt: Date.now(),
    }));

  const persistSessions = async () => {
    const savedById = new Map(
      plugin.settings.assistantChatSessions.map(session => [session.id, session]),
    );
    sessions.value.forEach(session => {
      if (!session.messages.length) return;
      savedById.set(session.id, {
        ...session,
        messages: thinMessagesForPersist(session.messages),
      });
    });
    plugin.settings.assistantChatSessions = [...savedById.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SAVED_SESSIONS);
    plugin.settings.assistantOpenChatSessionIds = sessions.value.map(session => session.id);
    plugin.settings.assistantOpenChatSessions = buildOpenSessionSnapshots();
    await plugin.saveSettings();
    markHistoryChanged();
  };

  const persistOpenSessionIds = async () => {
    plugin.settings.assistantOpenChatSessionIds = sessions.value.map(session => session.id);
    plugin.settings.assistantOpenChatSessions = buildOpenSessionSnapshots();
    await plugin.saveSettings();
    markHistoryChanged();
  };

  const cancelScheduledPersist = () => {
    if (persistOpenTimer) clearTimeout(persistOpenTimer);
    persistOpenTimer = null;
  };

  const schedulePersistOpenSessionIds = () => {
    cancelScheduledPersist();
    persistOpenTimer = setTimeout(() => {
      persistOpenTimer = null;
      void persistOpenSessionIds();
    }, PERSIST_OPEN_DELAY_MS);
  };

  const createSession = (persist = true) => {
    const file = activeMarkdownFile(plugin);
    const previousId = activeSessionId.value;
    if (previousId) draftInputs.value[previousId] = input.value;
    const session: ChatSession = {
      id: `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: file?.basename || t('chat.newSession', {count: sessions.value.length + 1}),
      contextPath: file?.path || '',
      contextPaths: file?.path ? [file.path] : [],
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    sessions.value.push(session);
    draftInputs.value[session.id] = '';
    suppressSessionSwitchSync.value = true;
    activeSessionId.value = session.id;
    setComposerInput('');
    void nextTick(() => {
      suppressSessionSwitchSync.value = false;
    });
    if (persist) void persistSessions();
    return session;
  };

  const restoreSession = (
    id: string,
    savedById: Map<string, AssistantChatSession>,
    openSnapshots: AssistantOpenChatSession[],
  ) => {
    const existing = sessions.value.find(session => session.id === id);
    // A streaming reply writes into the in-memory session object; swapping it out would drop the answer.
    if (existing && runs.isSessionLoading(id)) return existing;
    const saved = savedById.get(id);
    if (saved) return toChatSession(saved);
    if (existing) return toChatSession(existing);
    const snapshot = openSnapshots.find(item => item.id === id);
    if (!snapshot) return null;
    return toChatSession({
      id: snapshot.id,
      title: snapshot.title || t('chat.defaultTitle'),
      contextPath: snapshot.contextPath || '',
      contextPaths: snapshot.contextPaths || (snapshot.contextPath ? [snapshot.contextPath] : []),
      messages: [],
      createdAt: snapshot.createdAt || snapshot.updatedAt || Date.now(),
      updatedAt: snapshot.updatedAt || Date.now(),
    });
  };

  const loadSessionsFromSettings = () => {
    const savedById = new Map(
      plugin.settings.assistantChatSessions.map(session => [session.id, session]),
    );
    const openSnapshots = (plugin.settings.assistantOpenChatSessions || []).filter(
      item => item?.id,
    );
    draftInputs.value = {
      ...Object.fromEntries(openSnapshots.map(item => [item.id, item.draftInput || ''])),
      ...draftInputs.value,
    };
    const openIds = openSnapshots.length
      ? openSnapshots.map(item => item.id)
      : plugin.settings.assistantOpenChatSessionIds || [];
    const fallbackOpenIds = sessions.value.map(session => session.id);
    const idsToRestore = openIds.length ? openIds : fallbackOpenIds;
    sessions.value = idsToRestore
      .map(id => restoreSession(id, savedById, openSnapshots))
      .filter((session): session is ChatSession => Boolean(session));
    if (!sessions.value.length) {
      createSession(false);
    }
    if (!sessions.value.some(session => session.id === activeSessionId.value)) {
      activeSessionId.value = sessions.value[0]?.id || '';
    }
    const activeOpenSnapshot = openSnapshots.find(item => item.id === activeSessionId.value);
    const restoredInput =
      draftInputs.value[activeSessionId.value] || activeOpenSnapshot?.draftInput || '';
    // Re-rendering an unchanged composer would jump the caret to the end while the user is typing.
    if (restoredInput !== input.value) setComposerInput(restoredInput);
    sessionsReady.value = true;
    historyRevision.value += 1;
    onLoaded();
  };

  const closeSession = async (id: string) => {
    cancelScheduledPersist();
    runs.abortSession(id);
    const closedSession = sessions.value.find(item => item.id === id);
    sessions.value = sessions.value.filter(item => item.id !== id);
    delete draftInputs.value[id];
    if (closedSession && !closedSession.messages.length) {
      plugin.settings.assistantChatSessions = plugin.settings.assistantChatSessions.filter(
        item => item.id !== id,
      );
    }
    if (!sessions.value.length) createSession(false);
    if (activeSessionId.value === id) activeSessionId.value = sessions.value[0].id;
    await persistOpenSessionIds();
  };

  const clearAll = async () => {
    runs.resetAll();
    const emptySessionIds = new Set(
      sessions.value.filter(session => !session.messages.length).map(session => session.id),
    );
    sessions.value = [];
    draftInputs.value = {};
    plugin.settings.assistantChatSessions = plugin.settings.assistantChatSessions.filter(
      session => !emptySessionIds.has(session.id),
    );
    plugin.settings.assistantOpenChatSessionIds = [];
    plugin.settings.assistantOpenChatSessions = [];
    await plugin.saveSettings();
    markHistoryChanged();
    createSession(false);
  };

  const clearActiveSession = () => {
    const session = activeSession.value;
    if (!session) return;
    session.messages = [];
    session.updatedAt = Date.now();
    setComposerInput('');
    draftInputs.value[session.id] = '';
    void persistSessions();
  };

  /** Activates an open session, or reopens a saved one as a tab; returns null when the id is unknown. */
  const activateHistoryItem = (id?: string): ChatSession | null => {
    if (!id) return null;
    const session = sessions.value.find(item => item.id === id);
    if (session) {
      activeSessionId.value = session.id;
      return session;
    }
    const saved = plugin.settings.assistantChatSessions.find(item => item.id === id);
    if (!saved) return null;
    const restored = toChatSession(saved);
    sessions.value.unshift(restored);
    activeSessionId.value = saved.id;
    void persistSessions();
    return restored;
  };

  const deleteHistoryItem = async (session: AssistantChatSession) => {
    const title = session.title || t('chat.defaultTitle');
    if (!window.confirm(t('chat.deleteConfirm', {title}))) return;

    plugin.settings.assistantChatSessions = plugin.settings.assistantChatSessions.filter(
      item => item.id !== session.id,
    );
    plugin.settings.assistantOpenChatSessionIds =
      plugin.settings.assistantOpenChatSessionIds.filter(id => id !== session.id);
    plugin.settings.assistantOpenChatSessions = plugin.settings.assistantOpenChatSessions.filter(
      item => item.id !== session.id,
    );
    runs.abortSession(session.id);
    sessions.value = sessions.value.filter(item => item.id !== session.id);
    delete draftInputs.value[session.id];
    if (!sessions.value.length) {
      createSession(false);
    } else if (activeSessionId.value === session.id) {
      activeSessionId.value = sessions.value[0].id;
    }

    await plugin.saveSettings();
    markHistoryChanged();
    new Notice(t('chat.deleted'));
  };

  /** Saves the open sessions and the active draft right away, e.g. when the view closes. */
  const persistNow = () => {
    cancelScheduledPersist();
    syncActiveDraftInput();
    void persistOpenSessionIds();
  };

  const onTaskHistoryUpdated = () => {
    if (skippingOwnHistoryEvent) return;
    loadSessionsFromSettings();
  };

  onMounted(() => window.addEventListener(WISEMIND_TASK_HISTORY_UPDATED_EVENT, onTaskHistoryUpdated));
  onUnmounted(() =>
    window.removeEventListener(WISEMIND_TASK_HISTORY_UPDATED_EVENT, onTaskHistoryUpdated),
  );

  return {
    sessions,
    activeSessionId,
    activeSession,
    sessionsReady,
    draftInputs,
    suppressSessionSwitchSync,
    savedChatSessions,
    syncActiveDraftInput,
    persistSessions,
    schedulePersistOpenSessionIds,
    loadSessionsFromSettings,
    createSession,
    closeSession,
    clearAll,
    clearActiveSession,
    activateHistoryItem,
    deleteHistoryItem,
    persistNow,
  };
};

export type ChatSessions = ReturnType<typeof useChatSessions>;
