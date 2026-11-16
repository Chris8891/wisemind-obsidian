import {ref} from 'vue';

/** Per-session abort controllers and the id of the reply currently streaming in each session. */
export const useChatRuns = () => {
  const abortControllers = ref<Record<string, AbortController>>({});
  const streamingMessageIds = ref<Record<string, string>>({});

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

  /** Stops the session's run and forgets it. */
  const abortSession = (sessionId: string) => {
    abortControllers.value[sessionId]?.abort();
    clearSessionController(sessionId);
    clearStreamingMessageId(sessionId);
  };

  const abortAll = () => {
    Object.values(abortControllers.value).forEach(controller => controller.abort());
  };

  /** Aborts every run and resets the bookkeeping, e.g. when all sessions are closed. */
  const resetAll = () => {
    abortAll();
    abortControllers.value = {};
    streamingMessageIds.value = {};
  };

  return {
    abortControllers,
    streamingMessageIds,
    isSessionLoading,
    setSessionController,
    clearSessionController,
    setStreamingMessageId,
    clearStreamingMessageId,
    abortSession,
    abortAll,
    resetAll,
  };
};

export type ChatRuns = ReturnType<typeof useChatRuns>;
