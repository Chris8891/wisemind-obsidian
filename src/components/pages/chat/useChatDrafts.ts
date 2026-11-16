import {nextTick, ref} from 'vue';

import type {ComposerInputOptions} from './types';
import type {ChatSessions} from './useChatSessions';

type PendingDraft = {
  message: string;
  autoSend: boolean;
  newSession: boolean;
  token: number;
};

/**
 * Applies drafts handed over from elsewhere in the plugin (openChatWithMessage), waiting until
 * the sessions are loaded; each draft token is applied once.
 */
export const useChatDrafts = (options: {
  sessions: ChatSessions;
  setComposerInput: (value: string, opts?: ComposerInputOptions) => void;
  send: () => Promise<void>;
  onConsumed: (token: number) => void;
}) => {
  const {sessions, setComposerInput, send, onConsumed} = options;
  const pendingDraft = ref<PendingDraft | null>(null);
  const appliedDraftToken = ref(0);

  const applyDraftMessage = async (
    messageValue?: string,
    autoSend = false,
    newSession = false,
    token = Date.now(),
  ) => {
    const message = (messageValue || '').trim();
    if (!message || token === appliedDraftToken.value) return;
    if (!sessions.sessionsReady.value || !sessions.activeSession.value) {
      pendingDraft.value = {message, autoSend, newSession, token};
      return;
    }
    appliedDraftToken.value = token;
    pendingDraft.value = null;
    onConsumed(token);
    if (newSession) {
      sessions.createSession(false);
      if (!autoSend) void sessions.persistSessions();
    }
    setComposerInput(message, {focus: true});
    const activeId = sessions.activeSessionId.value;
    if (activeId) sessions.draftInputs.value[activeId] = message;
    await nextTick();
    if (autoSend) await send();
  };

  const flushPendingDraft = async () => {
    const draft = pendingDraft.value;
    if (!draft) return;
    await applyDraftMessage(draft.message, draft.autoSend, draft.newSession, draft.token);
  };

  return {applyDraftMessage, flushPendingDraft};
};
