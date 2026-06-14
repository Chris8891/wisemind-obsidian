<script setup lang="ts">
  import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowTopRightOnSquareIcon,
    ArrowUpIcon,
    ChatBubbleOvalLeftEllipsisIcon,
    ClipboardDocumentIcon,
    ClockIcon,
    DocumentPlusIcon,
    DocumentTextIcon,
    PlusIcon,
    TrashIcon,
    XMarkIcon,
  } from '@heroicons/vue/24/outline';
  import {Notice} from 'obsidian';
  import {TabsContent, TabsList, TabsRoot, TabsTrigger} from 'reka-ui';

  import {usePlugin} from '../../composables/usePlugin';
  import {useVaultNotes} from '../../composables/useVaultNotes';
  import {useWiseMindConnectionGuard} from '../../composables/useWiseMindConnectionGuard';
  import {resolveLanguageSetting} from '../../i18n';
  import {type ChatInsertFormat, formatChatMessageForInsert} from '../../services/chatInsertFormat';
  import {type NoteMentionCandidate, searchNoteMentions} from '../../services/noteMentionSearch';
  import {openObsidianNote} from '../../services/noteNavigation';
  import {insertTextToActiveNote} from '../../services/noteWriter';
  import {
    notifyTaskHistoryUpdated,
    WISEMIND_TASK_HISTORY_UPDATED_EVENT,
  } from '../../services/taskHistory';
  import type {
    AssistantChatMessage,
    AssistantChatSession,
    AssistantOpenChatSession,
    ObsidianSourceItem,
  } from '../../types';
  import NoteMentionPicker from '../NoteMentionPicker.vue';
  import NotePickerDialog from '../NotePickerDialog.vue';
  import StreamingMarkdownView from '../StreamingMarkdownView.vue';
  import WiseMindConnectionDialog from '../WiseMindConnectionDialog.vue';
  import WmTooltip from '../WmTooltip.vue';

  type ChatRole = 'user' | 'assistant';
  type ChatMessage = AssistantChatMessage & {role: ChatRole};
  type ChatSession = AssistantChatSession & {
    messages: ChatMessage[];
  };
  type MentionTextSegment =
    | {type: 'text'; text: string; start: number; end: number}
    | {type: 'mention'; path: string; title: string; start: number; end: number};

  const props = defineProps<{
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

  const plugin = usePlugin();
  const {t} = useI18n();
  const {notes, query, refresh} = useVaultNotes();
  const {connectionDialogOpen, ensureWiseMindConnected} = useWiseMindConnectionGuard();
  const sessions = ref<ChatSession[]>([]);
  const activeSessionId = ref('');
  const input = ref('');
  const error = ref('');
  const modelLabel = ref(t('chat.currentModel'));
  const mentionOpen = ref(false);
  const mentionActiveIndex = ref(0);
  const abortControllers = ref<Record<string, AbortController>>({});
  const inputEl = ref<HTMLDivElement | null>(null);
  const mentionWrapEl = ref<HTMLDivElement | null>(null);
  const historyDialogOpen = ref(false);
  const notePickerOpen = ref(false);
  const selectedNotesOpen = ref(false);
  const historyRevision = ref(0);
  const insertFormat = ref<ChatInsertFormat>('markdown');
  const streamingMessageIds = ref<Record<string, string>>({});
  const messagesEl = ref<HTMLDivElement | null>(null);
  const sessionTabsEl = ref<HTMLDivElement | null>(null);
  const sessionsReady = ref(false);
  const pendingDraft = ref<{
    message: string;
    autoSend: boolean;
    newSession: boolean;
    token: number;
  } | null>(null);
  const draftInputs = ref<Record<string, string>>({});
  const persistOpenTimer = ref<ReturnType<typeof setTimeout> | null>(null);
  const appliedDraftToken = ref(0);
  const skippingOwnHistoryEvent = ref(false);
  const suppressSessionSwitchSync = ref(false);

  const activeSession = computed(
    () => sessions.value.find(item => item.id === activeSessionId.value) || sessions.value[0],
  );
  const activeSessionLoading = computed(() => Boolean(abortControllers.value[activeSessionId.value]));
  const canSend = computed(() => Boolean(input.value.trim()) && !activeSessionLoading.value);
  const savedChatSessions = computed(() => {
    void historyRevision.value;
    return [...(plugin.settings.assistantChatSessions || [])].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  });
  const savedChatSessionCount = computed(() => savedChatSessions.value.length);
  const mentionCandidates = computed(() => {
    const limit = Math.max(0, Math.floor(Number(plugin.settings.mentionNoteLimit || 0)));
    return searchNoteMentions(notes.value, query.value, limit, {
      title: t('mention.titleMatch'),
      alias: t('mention.aliasMatch'),
      path: t('mention.pathMatch'),
      tag: t('mention.tagMatch'),
      folder: t('mention.folderMatch'),
    });
  });
  const activeContextPaths = computed(() => {
    const session = activeSession.value;
    if (!session) return [];
    const paths = Array.isArray(session.contextPaths) ? session.contextPaths : [];
    const all = [session.contextPath, ...paths].filter(Boolean);
    return Array.from(new Set(all));
  });
  const selectedContextNotes = computed(() =>
    notes.value.filter(note => activeContextPaths.value.includes(note.path)),
  );
  const noteByPath = computed(
    () => new Map(notes.value.map(note => [note.path, note])),
  );

  const titleFromPath = (path: string) => path.replace(/\.md$/i, '').split('/').pop() || path;

  const mentionToken = (path: string) => `@${path}`;

  const tokenizeMentionText = (text: string): MentionTextSegment[] => {
    if (!text) return [];
    const notePaths = [...noteByPath.value.keys()].sort((a, b) => b.length - a.length);
    const segments: MentionTextSegment[] = [];
    let index = 0;
    let textBuffer = '';
    let textStart = 0;

    const flushText = (end: number) => {
      if (!textBuffer) return;
      segments.push({type: 'text', text: textBuffer, start: textStart, end});
      textBuffer = '';
    };

    while (index < text.length) {
      let matchedPath = '';
      if (text[index] === '@') {
        matchedPath =
          notePaths.find(path => {
            const token = mentionToken(path);
            if (!text.startsWith(token, index)) return false;
            const nextChar = text[index + token.length];
            return !nextChar || /\s/.test(nextChar);
          }) || '';
      }

      if (matchedPath) {
        flushText(index);
        const start = index;
        const end = index + mentionToken(matchedPath).length;
        const note = noteByPath.value.get(matchedPath);
        segments.push({
          type: 'mention',
          path: matchedPath,
          title: note?.title || titleFromPath(matchedPath),
          start,
          end,
        });
        index = end;
        textStart = index;
        continue;
      }

      if (!textBuffer) textStart = index;
      textBuffer += text[index];
      index += 1;
    }
    flushText(text.length);
    return segments;
  };

  const nodeInputLength = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length || 0;
    if (node instanceof HTMLElement && node.dataset.mentionPath) {
      return mentionToken(node.dataset.mentionPath).length;
    }
    return node.textContent?.length || 0;
  };

  const readComposerInput = () => {
    const el = inputEl.value;
    if (!el) return input.value;
    return Array.from(el.childNodes)
      .map(node => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
        if (node instanceof HTMLElement && node.dataset.mentionPath) {
          return mentionToken(node.dataset.mentionPath);
        }
        if (node.nodeName === 'BR') return '\n';
        return node.textContent || '';
      })
      .join('')
      .replace(/\u00a0/g, ' ');
  };

  const getComposerCursorOffset = () => {
    const el = inputEl.value;
    const selection = window.getSelection();
    if (!el || !selection?.anchorNode || !el.contains(selection.anchorNode)) {
      return input.value.length;
    }

    let offset = 0;
    const anchorNode = selection.anchorNode;
    const anchorOffset = selection.anchorOffset;
    const children = Array.from(el.childNodes);

    if (anchorNode === el) {
      return children.slice(0, anchorOffset).reduce((sum, node) => sum + nodeInputLength(node), 0);
    }

    for (const child of children) {
      if (child === anchorNode) {
        return offset + anchorOffset;
      }
      if (child.contains(anchorNode)) {
        return offset + (anchorOffset > 0 ? nodeInputLength(child) : 0);
      }
      offset += nodeInputLength(child);
    }

    return input.value.length;
  };

  const setComposerCursorOffset = (targetOffset: number) => {
    const el = inputEl.value;
    const selection = window.getSelection();
    if (!el || !selection) return;
    const range = document.createRange();
    const children = Array.from(el.childNodes);
    let offset = 0;

    for (const child of children) {
      const length = nodeInputLength(child);
      if (targetOffset <= offset + length) {
        if (child.nodeType === Node.TEXT_NODE) {
          range.setStart(child, Math.max(0, Math.min(targetOffset - offset, length)));
        } else if (targetOffset <= offset) {
          range.setStartBefore(child);
        } else {
          range.setStartAfter(child);
        }
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      offset += length;
    }

    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const renderComposerInput = async (cursorOffset = input.value.length) => {
    await nextTick();
    const el = inputEl.value;
    if (!el) return;
    const wasFocused = document.activeElement === el;
    const segments = tokenizeMentionText(input.value);
    el.replaceChildren();
    segments.forEach(segment => {
      if (segment.type === 'text') {
        el.append(document.createTextNode(segment.text));
        return;
      }
      const badge = document.createElement('span');
      badge.className = 'wm-mention-badge';
      badge.contentEditable = 'false';
      badge.dataset.mentionPath = segment.path;
      badge.title = segment.path;
      const label = document.createElement('span');
      label.className = 'wm-mention-badge-label';
      label.textContent = segment.title;
      badge.append(label);
      el.append(badge);
    });
    if (wasFocused) setComposerCursorOffset(cursorOffset);
  };

  const insertComposerText = (text: string) => {
    const cursor = getComposerCursorOffset();
    input.value = `${input.value.slice(0, cursor)}${text}${input.value.slice(cursor)}`;
    syncActiveDraftInput();
    mentionOpen.value = false;
    void renderComposerInput(cursor + text.length);
    schedulePersistOpenSessionIds();
  };

  const setComposerInput = (value: string, options: {focus?: boolean; cursor?: number} = {}) => {
    input.value = value;
    const cursor = options.cursor ?? value.length;
    void renderComposerInput(cursor).then(() => {
      if (!options.focus) return;
      inputEl.value?.focus();
      setComposerCursorOffset(cursor);
    });
  };

  const syncActiveDraftInput = () => {
    if (activeSessionId.value) draftInputs.value[activeSessionId.value] = input.value;
  };

  const removeMentionAroundCursor = (direction: 'backward' | 'forward') => {
    const cursor = getComposerCursorOffset();
    const segments = tokenizeMentionText(input.value).filter(
      (segment): segment is Extract<MentionTextSegment, {type: 'mention'}> =>
        segment.type === 'mention',
    );
    const mention = segments.find(segment => {
      if (direction === 'backward') {
        return (
          cursor === segment.end ||
          (cursor === segment.end + 1 && input.value[segment.end] === ' ') ||
          (cursor > segment.start && cursor <= segment.end)
        );
      }
      return cursor === segment.start || (cursor >= segment.start && cursor < segment.end);
    });
    if (!mention) return false;

    const removeEnd =
      input.value[mention.end] === ' ' || input.value[mention.end] === '\n'
        ? mention.end + 1
        : mention.end;
    input.value = `${input.value.slice(0, mention.start)}${input.value.slice(removeEnd)}`;
    syncActiveDraftInput();
    mentionOpen.value = false;
    void renderComposerInput(mention.start);
    schedulePersistOpenSessionIds();
    return true;
  };

  const isSessionLoading = (sessionId: string) => Boolean(abortControllers.value[sessionId]);

  const setSessionController = (sessionId: string, controller: AbortController) => {
    abortControllers.value = {...abortControllers.value, [sessionId]: controller};
  };

  const clearSessionController = (sessionId: string) => {
    const next = {...abortControllers.value};
    delete next[sessionId];
    abortControllers.value = next;
  };

  const setStreamingMessageId = (sessionId: string, messageId: string) => {
    streamingMessageIds.value = {...streamingMessageIds.value, [sessionId]: messageId};
  };

  const clearStreamingMessageId = (sessionId: string) => {
    const next = {...streamingMessageIds.value};
    delete next[sessionId];
    streamingMessageIds.value = next;
  };

  const toChatSession = (session: AssistantChatSession): ChatSession => ({
    ...session,
    messages: [...(session.messages || [])],
  });

  const buildOpenSessionSnapshots = () => {
    return sessions.value.map<AssistantOpenChatSession>(session => ({
      id: session.id,
      title: session.title,
      contextPath: session.contextPath,
      contextPaths: session.contextPaths,
      createdAt: session.createdAt,
      draftInput: session.id === activeSessionId.value ? input.value : draftInputs.value[session.id] || '',
      updatedAt: Date.now(),
    }));
  };

  const loadSessionsFromSettings = () => {
    const savedById = new Map(plugin.settings.assistantChatSessions.map(session => [session.id, session]));
    const openSnapshots = (plugin.settings.assistantOpenChatSessions || []).filter(item =>
      item?.id,
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
      .map(id => {
        const saved = savedById.get(id);
        if (saved) return saved;
        const existing = sessions.value.find(session => session.id === id);
        if (existing) return existing;
        const snapshot = openSnapshots.find(item => item.id === id);
        if (!snapshot) return null;
        return {
          id: snapshot.id,
          title: snapshot.title || t('chat.defaultTitle'),
          contextPath: snapshot.contextPath || '',
          contextPaths: snapshot.contextPaths || (snapshot.contextPath ? [snapshot.contextPath] : []),
          messages: [],
          createdAt: snapshot.createdAt || snapshot.updatedAt || Date.now(),
          updatedAt: snapshot.updatedAt || Date.now(),
        };
      })
      .filter(Boolean)
      .map(session => toChatSession(session as AssistantChatSession));
    if (!sessions.value.length) {
      createSession(false);
    }
    if (!sessions.value.some(session => session.id === activeSessionId.value)) {
      activeSessionId.value = sessions.value[0]?.id || '';
    }
    const activeOpenSnapshot = openSnapshots.find(item => item.id === activeSessionId.value);
    setComposerInput(
      draftInputs.value[activeSessionId.value] || activeOpenSnapshot?.draftInput || '',
    );
    sessionsReady.value = true;
    historyRevision.value += 1;
    void scrollActiveSessionTabIntoView();
    void flushPendingDraft();
  };

  const findActiveMention = (text: string, cursor: number) => {
    const before = text.slice(0, cursor);
    const lineStart = Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r')) + 1;
    const lineBeforeCursor = before.slice(lineStart);
    const atIndex = lineBeforeCursor.lastIndexOf('@');
    if (atIndex === -1) return null;
    if (atIndex > 0 && !/\s/.test(lineBeforeCursor[atIndex - 1])) return null;
    const queryText = lineBeforeCursor.slice(atIndex + 1);
    if (/\s/.test(queryText)) return null;
    return {
      start: lineStart + atIndex,
      query: queryText,
    };
  };

  const notifyHistoryChanged = () => {
    skippingOwnHistoryEvent.value = true;
    notifyTaskHistoryUpdated();
    skippingOwnHistoryEvent.value = false;
  };

  const persistSessions = async () => {
    const savedById = new Map(
      plugin.settings.assistantChatSessions.map(session => [session.id, session]),
    );
    sessions.value.forEach(session => {
      if (!session.messages.length) return;
      savedById.set(session.id, {
        ...session,
        messages: [...session.messages],
      });
    });
    plugin.settings.assistantChatSessions = [...savedById.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50);
    plugin.settings.assistantOpenChatSessionIds = sessions.value.map(session => session.id);
    plugin.settings.assistantOpenChatSessions = buildOpenSessionSnapshots();
    await plugin.saveSettings();
    historyRevision.value += 1;
    notifyHistoryChanged();
  };

  const createSession = (persist = true) => {
    const file = plugin.app.workspace.getActiveFile();
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
      void scrollActiveSessionTabIntoView();
    });
    if (persist) void persistSessions();
    return session;
  };

  const persistOpenSessionIds = async () => {
    plugin.settings.assistantOpenChatSessionIds = sessions.value.map(session => session.id);
    plugin.settings.assistantOpenChatSessions = buildOpenSessionSnapshots();
    await plugin.saveSettings();
    historyRevision.value += 1;
    notifyHistoryChanged();
  };

  const schedulePersistOpenSessionIds = () => {
    if (persistOpenTimer.value) clearTimeout(persistOpenTimer.value);
    persistOpenTimer.value = setTimeout(() => {
      persistOpenTimer.value = null;
      void persistOpenSessionIds();
    }, 350);
  };

  const closeSession = async (id: string) => {
    if (persistOpenTimer.value) {
      clearTimeout(persistOpenTimer.value);
      persistOpenTimer.value = null;
    }
    abortControllers.value[id]?.abort();
    clearSessionController(id);
    clearStreamingMessageId(id);
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
    historyRevision.value += 1;
    notifyHistoryChanged();
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

  const setActiveContextPath = (path: string) => {
    const session = activeSession.value;
    if (!session) return;
    session.contextPath = path;
    session.contextPaths = path ? [path] : [];
    session.updatedAt = Date.now();
    void persistSessions();
  };

  const setActiveContextNotes = (items: ObsidianSourceItem[]) => {
    const session = activeSession.value;
    if (!session) return;
    const paths = items.map(item => item.path);
    session.contextPaths = paths;
    session.contextPath = paths[0] || '';
    session.updatedAt = Date.now();
    notePickerOpen.value = false;
    selectedNotesOpen.value = false;
    void persistSessions();
  };

  const removeActiveContextPath = (path: string) => {
    const session = activeSession.value;
    if (!session) return;
    const paths = activeContextPaths.value.filter(item => item !== path);
    session.contextPaths = paths;
    session.contextPath = paths[0] || '';
    if (paths.length <= 1) selectedNotesOpen.value = false;
    session.updatedAt = Date.now();
    void persistSessions();
  };

  const openContextNote = (path: string) => {
    void openObsidianNote(plugin.app, path, {
      moved: t('obsidianMessages.noteMoved'),
      openFailed: t('obsidianMessages.noteOpenFailed'),
    });
  };

  const openHistoryItem = async (id?: string) => {
    if (!id) return;
    const session = sessions.value.find(item => item.id === id);
    if (session) {
      activeSessionId.value = session.id;
      historyDialogOpen.value = false;
      if (session.contextPath)
        await openObsidianNote(plugin.app, session.contextPath, {
          moved: t('obsidianMessages.noteMoved'),
          openFailed: t('obsidianMessages.noteOpenFailed'),
        });
      return;
    }
    const saved = plugin.settings.assistantChatSessions.find(item => item.id === id);
    if (!saved) return;
    sessions.value.unshift({
      ...saved,
      messages: [...(saved.messages || [])],
    });
    activeSessionId.value = saved.id;
    historyDialogOpen.value = false;
    void persistSessions();
    if (saved.contextPath)
      await openObsidianNote(plugin.app, saved.contextPath, {
        moved: t('obsidianMessages.noteMoved'),
        openFailed: t('obsidianMessages.noteOpenFailed'),
      });
  };

  const deleteHistoryItem = async (session: AssistantChatSession) => {
    const title = session.title || t('chat.defaultTitle');
    if (!window.confirm(t('chat.deleteConfirm', {title}))) return;

    plugin.settings.assistantChatSessions = plugin.settings.assistantChatSessions.filter(
      item => item.id !== session.id,
    );
    plugin.settings.assistantOpenChatSessionIds = plugin.settings.assistantOpenChatSessionIds.filter(
      id => id !== session.id,
    );
    plugin.settings.assistantOpenChatSessions = plugin.settings.assistantOpenChatSessions.filter(
      item => item.id !== session.id,
    );
    abortControllers.value[session.id]?.abort();
    clearSessionController(session.id);
    clearStreamingMessageId(session.id);
    sessions.value = sessions.value.filter(item => item.id !== session.id);
    delete draftInputs.value[session.id];
    if (!sessions.value.length) {
      createSession(false);
    } else if (activeSessionId.value === session.id) {
      activeSessionId.value = sessions.value[0].id;
    }

    await plugin.saveSettings();
    historyRevision.value += 1;
    notifyHistoryChanged();
    new Notice(t('chat.deleted'));
  };

  const formatHistoryTime = (time: number) =>
    new Date(time).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const extractMentionedPaths = (message: string) => {
    const sorted = [...notes.value].sort((a, b) => b.path.length - a.path.length);
    return sorted.filter(note => message.includes(mentionToken(note.path))).map(note => note.path);
  };

  const scrollMessagesToBottom = async () => {
    await nextTick();
    const el = messagesEl.value;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  const scrollActiveSessionTabIntoView = async () => {
    await nextTick();
    const tabsEl = sessionTabsEl.value;
    if (!tabsEl || !activeSessionId.value) return;
    const activeTab = Array.from(
      tabsEl.querySelectorAll<HTMLElement>('[data-session-id]'),
    ).find(item => item.dataset.sessionId === activeSessionId.value);
    activeTab?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  };

  const buildReference = async (path: string) => {
    if (!path) return null;
    const note = notes.value.find(item => item.path === path);
    if (!note) return null;
    return {title: note.title, path: note.path, content: note.markdown || note.plainText};
  };

  const send = async () => {
    const session = activeSession.value;
    const message = input.value.trim();
    if (!session || !message || isSessionLoading(session.id)) return;
    if (!(await ensureWiseMindConnected())) return;
    const controller = new AbortController();
    setSessionController(session.id, controller);
    error.value = '';
    clearStreamingMessageId(session.id);
    session.messages.push({
      id: `msg-${Date.now()}`,
      role: 'user',
      content: message,
      createdAt: Date.now(),
    });
    session.title = session.messages.length === 1 ? message.slice(0, 18) : session.title;
    session.updatedAt = Date.now();
    setComposerInput('');
    draftInputs.value[session.id] = '';

    try {
      const contextPaths = activeContextPaths.value;
      const currentNote = await buildReference(contextPaths[0] || '');
      const referencePaths = Array.from(
        new Set([...contextPaths.slice(1), ...extractMentionedPaths(message)]),
      ).filter(path => path !== currentNote?.path);
      const references = (await Promise.all(referencePaths.map(buildReference))).filter(Boolean);
      const history = session.messages
        .slice(0, -1)
        .slice(-12)
        .map(item => ({role: item.role, content: item.content}));
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
      };
      session.messages.push(assistantMessage);
      const assistantMessageIndex = session.messages.length - 1;
      setStreamingMessageId(session.id, assistantMessage.id);
      void scrollMessagesToBottom();
      const result: any = await plugin.api.chatStream(
        {
          message,
          language: resolveLanguageSetting(plugin.settings.assistantDefaults.language),
          currentNote,
          references,
          history,
        },
        {
          onDelta: text => {
            const target = session.messages[assistantMessageIndex];
            if (!target) return;
            target.content += text;
            session.updatedAt = Date.now();
            void scrollMessagesToBottom();
          },
        },
        {signal: controller.signal},
      );
      const target = session.messages[assistantMessageIndex];
      if (target) {
        target.content = String(result.message || target.content || '').trim();
        if (!target.content) {
          target.content = t('chat.emptyResponse');
        }
      }
      if (result.model) modelLabel.value = result.model;
    } catch (err: any) {
      if (!controller.signal.aborted && activeSessionId.value === session.id) {
        error.value = err?.message || t('chat.failed');
      }
    } finally {
      session.updatedAt = Date.now();
      void persistSessions();
      clearSessionController(session.id);
      clearStreamingMessageId(session.id);
    }
  };

  const stop = () => {
    const sessionId = activeSessionId.value;
    if (!sessionId) return;
    abortControllers.value[sessionId]?.abort();
    clearSessionController(sessionId);
    clearStreamingMessageId(sessionId);
  };

  const copyMessage = async (content: string) => {
    await globalThis.navigator?.clipboard?.writeText(content);
    new Notice(t('chat.copied'));
  };

  const insertMessage = async (content: string) => {
    await insertTextToActiveNote(
      plugin,
      formatChatMessageForInsert(content, insertFormat.value, {
        title: t('markdownInsert.chatTitle'),
      }),
      t('chat.inserted'),
    );
  };

  const onInput = () => {
    const cursor = getComposerCursorOffset();
    input.value = readComposerInput();
    const mention = findActiveMention(input.value, cursor);
    mentionOpen.value = Boolean(mention);
    query.value = mention?.query || '';
    mentionActiveIndex.value = 0;
    syncActiveDraftInput();
    schedulePersistOpenSessionIds();
  };

  const pickMentionCandidate = async (candidate: NoteMentionCandidate) => {
    const composer = inputEl.value;
    if (!composer) return;
    const cursor = getComposerCursorOffset();
    const after = input.value.slice(cursor);
    const mention = findActiveMention(input.value, cursor);
    const start = mention?.start ?? cursor;
    const insertText = `${mentionToken(candidate.path)} `;
    input.value = `${input.value.slice(0, start)}${insertText}${after}`;
    syncActiveDraftInput();
    mentionOpen.value = false;
    await nextTick();
    composer.focus();
    await renderComposerInput(start + insertText.length);
    schedulePersistOpenSessionIds();
  };

  const onComposerKeydown = (event: KeyboardEvent) => {
    if (mentionOpen.value) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        mentionActiveIndex.value = Math.min(
          mentionActiveIndex.value + 1,
          Math.max(mentionCandidates.value.length - 1, 0),
        );
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        mentionActiveIndex.value = Math.max(mentionActiveIndex.value - 1, 0);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        mentionOpen.value = false;
        return;
      }
      if (event.key === 'Enter') {
        const candidate = mentionCandidates.value[mentionActiveIndex.value];
        if (candidate) {
          event.preventDefault();
          void pickMentionCandidate(candidate);
          return;
        }
      }
    }

    if ((event.key === 'Backspace' || event.key === 'Delete') && !event.shiftKey) {
      const removed = removeMentionAroundCursor(
        event.key === 'Backspace' ? 'backward' : 'forward',
      );
      if (removed) {
        event.preventDefault();
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const onComposerPaste = (event: ClipboardEvent) => {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';
    insertComposerText(text);
  };

  const onDocumentPointerDown = (event: PointerEvent) => {
    if (!mentionOpen.value) return;
    const target = event.target as Node | null;
    if (target && mentionWrapEl.value?.contains(target)) return;
    mentionOpen.value = false;
  };

  const applyDraftMessage = async (
    messageValue?: string,
    autoSend = false,
    newSession = false,
    token = Date.now(),
  ) => {
    const message = (messageValue || '').trim();
    if (!message || token === appliedDraftToken.value) return;
    if (!sessionsReady.value || !activeSession.value) {
      pendingDraft.value = {message, autoSend, newSession, token};
      return;
    }
    appliedDraftToken.value = token;
    pendingDraft.value = null;
    emit('draftConsumed', token);
    if (newSession) {
      createSession(false);
      if (!autoSend) void persistSessions();
    }
    setComposerInput(message, {focus: true});
    if (activeSessionId.value) draftInputs.value[activeSessionId.value] = message;
    await nextTick();
    if (autoSend) await send();
  };

  const flushPendingDraft = async () => {
    const draft = pendingDraft.value;
    if (!draft) return;
    await applyDraftMessage(draft.message, draft.autoSend, draft.newSession, draft.token);
  };

  onMounted(async () => {
    await refresh();
    loadSessionsFromSettings();
    void openHistoryItem(props.historyItemId);
    window.addEventListener(WISEMIND_TASK_HISTORY_UPDATED_EVENT, onTaskHistoryUpdated);
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    try {
      const result = await plugin.api.getAssistantModel();
      modelLabel.value = result.model || modelLabel.value;
    } catch {
      modelLabel.value = t('chat.modelNotConfigured');
    }
  });

  onUnmounted(() => {
    window.removeEventListener(WISEMIND_TASK_HISTORY_UPDATED_EVENT, onTaskHistoryUpdated);
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    if (persistOpenTimer.value) clearTimeout(persistOpenTimer.value);
    persistOpenTimer.value = null;
    if (activeSessionId.value) draftInputs.value[activeSessionId.value] = input.value;
    void persistOpenSessionIds();
  });

  const onTaskHistoryUpdated = () => {
    if (skippingOwnHistoryEvent.value) return;
    loadSessionsFromSettings();
  };

  watch(
    () => props.historyToken,
    () => void openHistoryItem(props.historyItemId),
    {immediate: true},
  );

  watch(
    activeSessionId,
    (nextId, previousId) => {
      if (suppressSessionSwitchSync.value) return;
      if (previousId) draftInputs.value[previousId] = input.value;
      setComposerInput(nextId ? draftInputs.value[nextId] || '' : '');
      void scrollMessagesToBottom();
      void scrollActiveSessionTabIntoView();
      schedulePersistOpenSessionIds();
    },
    {flush: 'post'},
  );

  watch(
    () => props.draftToken,
    token => {
      if (!token) return;
      void applyDraftMessage(
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
  <section
    class="wm-page wm:flex wm:h-[calc(100vh-112px)] wm:max-h-[calc(100vh-112px)] wm:min-h-0 wm:overflow-hidden"
  >
    <header class="wm-page-header">
      <div class="wm-title-line">
        <ChatBubbleOvalLeftEllipsisIcon class="wm-title-icon" />
        <h2>{{ t('chat.title') }}</h2>
      </div>
      <div class="wm-toolbar">
        <WmTooltip :content="t('chat.history')">
          <button class="wm-icon-button" type="button" @click="historyDialogOpen = true">
            <ClockIcon class="wm-icon" />
          </button>
        </WmTooltip>
        <WmTooltip :content="t('chat.createSession')">
          <button class="wm-icon-button" type="button" @click="createSession()">
            <PlusIcon class="wm-icon" />
          </button>
        </WmTooltip>
        <WmTooltip :content="t('chat.closeAll')">
          <button class="wm-icon-button" type="button" @click="clearAll">
            <TrashIcon class="wm-icon" />
          </button>
        </WmTooltip>
      </div>
    </header>

    <TabsRoot
      v-if="activeSession"
      v-model="activeSessionId"
      class="wm:flex wm:min-h-0 wm:min-w-0 wm:flex-1 wm:flex-col"
    >
      <TabsList
        ref="sessionTabsEl"
        class="wm:flex wm:gap-1.5 wm:overflow-x-auto wm:border-b wm:border-[var(--background-modifier-border)] wm:pb-2"
        :aria-label="t('chat.sessionList')"
      >
        <TabsTrigger
          v-for="session in sessions"
          :key="session.id"
          class="wm-chat-session-tab"
          :class="{'is-active': activeSessionId === session.id}"
          :value="session.id"
          :data-session-id="session.id"
        >
          <span v-if="isSessionLoading(session.id)" class="wm-loading-spinner wm-chat-tab-loading"></span>
          <span class="wm:truncate">{{ session.title }}</span>
          <WmTooltip :content="t('chat.close')">
            <button
              class="wm-chat-session-close"
              type="button"
              @click.stop="closeSession(session.id)"
            >
              <XMarkIcon class="wm-icon" />
            </button>
          </WmTooltip>
        </TabsTrigger>
      </TabsList>

      <TabsContent
        :value="activeSession.id"
        class="wm:grid wm:h-full wm:min-h-0 wm:min-w-0 wm:flex-1 wm:overflow-hidden wm:[grid-template-rows:minmax(0,1fr)_auto_auto]"
      >
        <div
          ref="messagesEl"
          class="wm:flex wm:h-full wm:max-h-full wm:min-h-0 wm:flex-col wm:gap-2.5 wm:overflow-auto wm:py-2"
        >
          <div
            v-if="!activeSession.messages.length && !activeSessionLoading"
            class="wm:grid wm:min-h-full wm:place-items-center wm:content-center wm:gap-3 wm:text-center wm:text-[var(--text-muted)]"
          >
            <ChatBubbleOvalLeftEllipsisIcon class="wm:h-[58px] wm:w-[58px] wm:opacity-55" />
            <h3>{{ t('chat.emptyGreeting') }}</h3>
            <button
              class="wm-button wm:rounded-full"
              type="button"
              @click="setComposerInput(t('chat.promptAsk'), {focus: true})"
              >{{ t('chat.askSomething') }}</button
            >
            <div class="wm:flex wm:flex-wrap wm:justify-center wm:gap-2">
              <button
                class="wm-button wm:rounded-full"
                type="button"
                @click="setComposerInput(t('chat.promptSummary'), {focus: true})"
                >{{ t('chat.summarize') }}</button
              >
              <button
                class="wm-button wm:rounded-full"
                type="button"
                @click="setComposerInput(t('chat.promptExtract'), {focus: true})"
                >{{ t('chat.extract') }}</button
              >
              <button
                class="wm-button wm:rounded-full"
                type="button"
                @click="setComposerInput(t('chat.promptQuestions'), {focus: true})"
                >{{ t('chat.questions') }}</button
              >
            </div>
          </div>

          <div
            v-for="message in activeSession.messages"
            :key="message.id"
            class="wm:flex wm:max-w-[86%] wm:flex-col wm:gap-1"
            :class="message.role === 'user' ? 'wm:self-end' : 'wm:self-start'"
          >
            <article
              class="wm:flex wm:flex-col wm:gap-1 wm:rounded-[10px] wm:border wm:border-[var(--background-modifier-border)] wm:px-2.5 wm:py-2"
              :class="
                message.role === 'user'
                  ? 'wm:bg-[color-mix(in_srgb,var(--interactive-accent)_12%,var(--background-secondary))]'
                  : 'wm:bg-[var(--background-secondary)]'
              "
            >
              <StreamingMarkdownView
                v-if="message.role === 'assistant'"
                :content="message.content"
                :streaming="streamingMessageIds[activeSession.id] === message.id"
                :placeholder="t('chat.thinking')"
              />
              <div v-else class="wm-chat-message-text">
                <template
                  v-for="(segment, index) in tokenizeMentionText(message.content)"
                  :key="index"
                >
                  <span v-if="segment.type === 'mention'" class="wm-mention-badge" :title="segment.path">
                    <span class="wm-mention-badge-label">{{ segment.title }}</span>
                  </span>
                  <template v-else>{{ segment.text }}</template>
                </template>
              </div>
            </article>
            <footer
              class="wm:flex wm:items-center wm:gap-2 wm:text-xs wm:text-[var(--text-muted)]"
              :class="message.role === 'user' ? 'wm:justify-end' : ''"
            >
              <span>{{
                new Date(message.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              }}</span>
              <div class="wm:flex wm:gap-1">
                <WmTooltip :content="t('chat.copy')">
                  <button
                    class="wm-icon-button wm-message-action-button"
                    type="button"
                    @click="copyMessage(message.content)"
                  >
                    <ClipboardDocumentIcon class="wm-icon" />
                  </button>
                </WmTooltip>
                <WmTooltip :content="t('chat.insertNote')">
                  <button
                    class="wm-icon-button wm-message-action-button"
                    type="button"
                    @click="insertMessage(message.content)"
                  >
                    <DocumentPlusIcon class="wm-icon" />
                  </button>
                </WmTooltip>
              </div>
            </footer>
          </div>

          <article
            v-if="activeSessionLoading && !streamingMessageIds[activeSession.id]"
            class="wm:flex wm:self-start wm:rounded-[10px] wm:border wm:border-[var(--background-modifier-border)] wm:bg-[var(--background-secondary)] wm:px-2.5 wm:py-2"
          >
            <div class="wm:flex wm:items-center wm:gap-2 wm:text-sm wm:text-[var(--text-muted)]">
              <span class="wm-loading-spinner"></span>
              <span>{{ t('chat.thinking') }}</span>
            </div>
          </article>
        </div>

        <div v-if="error" class="wm-alert is-error">{{ error }}</div>

        <div
          class="wm:relative wm:z-30 wm:grid wm:w-full wm:min-w-0 wm:flex-none wm:gap-2 wm:overflow-visible wm:border-t wm:border-[var(--background-modifier-border)] wm:pt-2.5"
        >
          <div class="wm-composer-top wm:min-w-0 wm:justify-start">
            <WmTooltip
              v-if="activeContextPaths.length > 1"
              :content="activeContextPaths.join('\\n')"
            >
              <button
                class="wm:inline-flex wm:max-w-[min(100%,420px)] wm:items-center wm:gap-1 wm:overflow-hidden wm:rounded-full wm:border wm:border-[var(--background-modifier-border)] wm:bg-[var(--background-primary)] wm:py-0.5 wm:pl-2.5 wm:pr-1.5"
                type="button"
                @click="selectedNotesOpen = !selectedNotesOpen"
              >
                <DocumentTextIcon class="wm-icon" />
                <span class="wm:min-w-0 wm:truncate wm:text-xs">
                  {{ t('chat.selectedNotes', {count: activeContextPaths.length}) }}
                </span>
              </button>
            </WmTooltip>
            <WmTooltip v-else :content="activeContextPaths[0] || t('chat.noSelectedNote')">
              <span
                class="wm:inline-flex wm:max-w-[min(100%,420px)] wm:items-center wm:gap-1 wm:overflow-hidden wm:rounded-full wm:border wm:border-[var(--background-modifier-border)] wm:bg-[var(--background-primary)] wm:py-0.5 wm:pl-2.5 wm:pr-1.5"
              >
                <DocumentTextIcon class="wm-icon" />
                <span class="wm:min-w-0 wm:truncate wm:text-xs">{{
                  activeContextPaths.length
                    ? activeContextPaths.length === 1
                      ? activeContextPaths[0]
                      : t('chat.selectedNotes', {count: activeContextPaths.length})
                    : t('chat.noSelectedNote')
                }}</span>
                <WmTooltip v-if="activeContextPaths.length === 1" :content="t('chat.openNote')">
                  <button
                    class="wm-icon-button"
                    type="button"
                    @click="openContextNote(activeContextPaths[0])"
                  >
                    <ArrowTopRightOnSquareIcon class="wm-icon" />
                  </button>
                </WmTooltip>
                <WmTooltip v-if="activeContextPaths.length" :content="t('chat.clearSelectedNotes')">
                  <button class="wm-icon-button" type="button" @click="setActiveContextPath('')">
                    <XMarkIcon class="wm-icon" />
                  </button>
                </WmTooltip>
                <WmTooltip v-else :content="t('chat.useCurrentNote')">
                  <button
                    class="wm-icon-button"
                    type="button"
                    @click="setActiveContextPath(plugin.app.workspace.getActiveFile()?.path || '')"
                  >
                    <PlusIcon class="wm-icon" />
                  </button>
                </WmTooltip>
              </span>
            </WmTooltip>
            <button class="wm-button" type="button" @click="notePickerOpen = true">
              <DocumentTextIcon class="wm-icon" />
              {{ t('chat.chooseNote') }}
            </button>
            <button class="wm-button" type="button" @click="clearActiveSession">{{
              t('chat.clear')
            }}</button>
          </div>

          <div
            v-if="selectedNotesOpen && activeContextPaths.length > 1"
            class="wm-mention-menu wm:absolute wm:bottom-full wm:left-0 wm:z-50 wm:mb-2 wm:max-h-[260px] wm:w-[min(420px,100%)]"
          >
            <div
              v-for="note in selectedContextNotes"
              :key="note.path"
              class="wm:grid wm:w-full wm:items-center wm:gap-1.5 wm:[grid-template-columns:minmax(0,1fr)_auto]"
            >
              <button
                class="wm:grid wm:h-auto wm:min-w-0 wm:justify-start wm:border-0 wm:bg-transparent wm:px-2 wm:py-1.5 wm:text-left wm:text-[var(--text-normal)]"
                type="button"
                @click="openContextNote(note.path)"
              >
                <span class="wm-mention-title">{{ note.title }}</span>
                <span class="wm-mention-path">{{ note.folderPath || t('chat.rootFolder') }}</span>
              </button>
              <button
                class="wm-chip-button"
                type="button"
                :aria-label="t('chat.removeNote')"
                @click="removeActiveContextPath(note.path)"
              >
                <XMarkIcon class="wm-icon" />
              </button>
            </div>
          </div>

          <div ref="mentionWrapEl" class="wm:relative wm:min-w-0">
            <div
              ref="inputEl"
              class="wm-chat-input wm-chat-rich-input wm:min-h-24 wm:pr-[50px] wm:pb-[42px]"
              :data-placeholder="t('chat.inputPlaceholder')"
              contenteditable="true"
              role="textbox"
              aria-multiline="true"
              @input="onInput"
              @keydown="onComposerKeydown"
              @paste="onComposerPaste"
            ></div>
            <NoteMentionPicker
              v-if="mentionOpen"
              :candidates="mentionCandidates"
              :active-index="mentionActiveIndex"
              @pick="pickMentionCandidate"
            />
            <button
              v-if="activeSessionLoading"
              class="wm:absolute wm:bottom-2.5 wm:right-2.5 wm:inline-flex wm:h-8 wm:w-8 wm:items-center wm:justify-center wm:rounded-full wm:border-0 wm:bg-[var(--interactive-accent)] wm:text-[var(--text-on-accent)]"
              type="button"
              :aria-label="t('chat.stop')"
              @click="stop"
            >
              <XMarkIcon class="wm-icon" />
            </button>
            <button
              v-else
              class="wm:absolute wm:bottom-2.5 wm:right-2.5 wm:inline-flex wm:h-8 wm:w-8 wm:items-center wm:justify-center wm:rounded-full wm:border-0 wm:bg-[var(--interactive-accent)] wm:text-[var(--text-on-accent)]"
              type="button"
              :aria-label="t('chat.send')"
              :disabled="!canSend"
              @click="send"
            >
              <ArrowUpIcon class="wm-icon" />
            </button>
          </div>
        </div>
      </TabsContent>
    </TabsRoot>
    <NotePickerDialog
      v-model:open="notePickerOpen"
      :selected-paths="activeContextPaths"
      @confirm="setActiveContextNotes"
    />
    <WiseMindConnectionDialog v-model:open="connectionDialogOpen" />

    <Teleport to="#wisemindai-obsidian-root">
      <div
        v-if="historyDialogOpen"
        class="wm-modal-overlay"
        @click.self="historyDialogOpen = false"
      >
        <section
          class="wm-modal-box wm:max-w-[640px]"
          role="dialog"
          aria-modal="true"
          :aria-label="t('chat.history')"
        >
          <header class="wm-history-dialog-header">
            <h3 class="wm-dialog-title">{{
              t('chat.historyTitle', {count: savedChatSessionCount})
            }}</h3>
            <button
              class="btn btn-sm btn-circle btn-ghost absolute right-4 top-4"
              type="button"
              @click="historyDialogOpen = false"
              >✕</button
            >
          </header>

          <div
            class="wm:flex wm:max-h-[400px] wm:min-h-[200px] wm:flex-col wm:gap-2 wm:overflow-x-hidden wm:overflow-y-auto"
          >
            <div
              v-for="session in savedChatSessions"
              :key="session.id"
              class="wm:flex wm:w-full wm:items-center wm:justify-between wm:gap-3 wm:rounded-[10px] wm:border wm:border-[var(--background-modifier-border)] wm:bg-[var(--background-secondary)] wm:p-2.5 wm:text-left wm:text-[var(--text-normal)]"
              role="button"
              tabindex="0"
              @click="openHistoryItem(session.id)"
              @keydown.enter.prevent="openHistoryItem(session.id)"
              @keydown.space.prevent="openHistoryItem(session.id)"
            >
              <span class="wm:inline-flex wm:min-w-0 wm:max-w-full wm:items-center wm:gap-2">
                <ChatBubbleOvalLeftEllipsisIcon
                  class="wm:h-4 wm:w-4 wm:flex-none wm:text-[var(--text-muted)]"
                />
                <strong class="wm:truncate">{{ session.title || t('chat.defaultTitle') }}</strong>
              </span>
              <div class="wm:inline-flex wm:min-w-0 wm:flex-none wm:items-center wm:gap-2">
                <small class="wm:truncate wm:text-xs wm:text-[var(--text-muted)]">{{
                  formatHistoryTime(session.updatedAt || session.createdAt)
                }}</small>
                <WmTooltip :content="t('taskHistory.delete')">
                  <button
                    class="wm-icon-button"
                    type="button"
                    @click.stop="deleteHistoryItem(session)"
                  >
                    <TrashIcon class="wm-icon" />
                  </button>
                </WmTooltip>
              </div>
            </div>
            <div v-if="!savedChatSessions.length" class="wm-sync-empty">{{
              t('chat.emptyHistory')
            }}</div>
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>
