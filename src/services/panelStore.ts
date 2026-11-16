import {reactive} from 'vue';

import type {AssistantActionPlan} from '../assistantActions';

/** Side-panel tabs aligned with the 10-14 prototype. Transcription is a full-panel overlay, not a tab. */
export type PanelTab = 'note' | 'ask' | 'review' | 'sync';
export type PanelOverlay = null | 'transcription';
export type NoteView = 'workbench' | 'summary' | 'cards';
/** @deprecated Prefer NoteView + openAskTab. Kept for gradual migration. */
export type AssistantView = NoteView | 'chat';

export const ASSISTANT_ACTION_EVENT = 'wisemindai:assistant-action';

type ChatDraft = {
  message: string;
  token: number;
  autoSend: boolean;
  newSession: boolean;
};

type HistorySelection = {
  type: 'summary' | 'cards' | 'chat' | 'sync';
  id: string;
  token: number;
};

/**
 * UI state shared by the plugin entry and the side panel.
 * Commands only mutate this state; the panel delivers actions once the target page is mounted,
 * so nothing is lost while a lazily mounted page does not exist yet.
 */
export const panelState = reactive({
  tab: 'note' as PanelTab,
  /** Full-panel overlays that replace the tab content (recording / transcription). */
  overlay: null as PanelOverlay,
  /** Sub-view inside the Note tab. Chat lives on the Ask tab. */
  noteView: 'workbench' as NoteView,
  /** Which summary-shaped result the note tab is showing. */
  summaryPreset: 'summary' as 'summary' | 'insights',
  connected: false,
  dueCount: 0,
  pendingAction: null as (AssistantActionPlan & {token: number}) | null,
  chatDraft: {message: '', token: 0, autoSend: false, newSession: false} as ChatDraft,
  history: null as HistorySelection | null,
  historyDialogOpen: false,
  backgroundTasksOpen: false,
  topicsOverviewOpen: false,
  pinnedNotePath: '',
  reviewStartToken: 0,
  onboardingOpen: false,
});

export const setOnboardingOpen = (open: boolean) => {
  panelState.onboardingOpen = open;
};

export const openPanelTab = (tab: PanelTab | 'assistant' | 'transcription') => {
  panelState.overlay = null;
  if (tab === 'assistant') {
    panelState.topicsOverviewOpen = false;
    panelState.tab = 'note';
    return;
  }
  if (tab === 'transcription') {
    openTranscriptionOverlay();
    return;
  }
  if (tab !== 'sync') panelState.topicsOverviewOpen = false;
  panelState.tab = tab;
};

export const openTranscriptionOverlay = () => {
  panelState.overlay = 'transcription';
};

export const closeOverlay = () => {
  panelState.overlay = null;
};

export const openNoteView = (view: NoteView) => {
  panelState.overlay = null;
  panelState.tab = 'note';
  panelState.noteView = view;
};

/** Opens Note or Ask depending on the view. Prefer openNoteView / openAskTab for new code. */
export const openAssistantView = (view: AssistantView) => {
  if (view === 'chat') {
    openAskTab();
    return;
  }
  openNoteView(view);
};

export const openAskTab = () => {
  panelState.overlay = null;
  panelState.tab = 'ask';
};

export const queueAssistantAction = (plan: AssistantActionPlan) => {
  panelState.history = null;
  panelState.summaryPreset = plan.preset === 'insights' ? 'insights' : 'summary';
  panelState.pendingAction = {...plan, token: Date.now()};
  openNoteView(plan.kind === 'cards' ? 'cards' : 'summary');
};

export const openChatWithMessage = (message: string, autoSend = false, newSession = false) => {
  panelState.history = null;
  panelState.chatDraft = {message, token: Date.now(), autoSend, newSession};
  openAskTab();
};

export const clearChatDraft = (token: number) => {
  if (panelState.chatDraft.token !== token) return;
  panelState.chatDraft = {message: '', token: 0, autoSend: false, newSession: false};
};

export const openHistorySelection = (selection: Omit<HistorySelection, 'token'>) => {
  panelState.history = {...selection, token: Date.now()};
  if (selection.type === 'sync') {
    openPanelTab('sync');
    return;
  }
  if (selection.type === 'chat') {
    openAskTab();
    return;
  }
  openNoteView(selection.type);
};

export const requestReviewStart = () => {
  panelState.overlay = null;
  panelState.tab = 'review';
  panelState.reviewStartToken = Date.now();
};

export const setConnected = (connected: boolean) => {
  panelState.connected = connected;
};

export const setDueCount = (count: number) => {
  panelState.dueCount = Math.max(0, Math.floor(count || 0));
};

export const openBackgroundTasks = () => {
  panelState.backgroundTasksOpen = true;
};

export const closeBackgroundTasks = () => {
  panelState.backgroundTasksOpen = false;
};

export const openTopicsOverview = () => {
  panelState.overlay = null;
  panelState.tab = 'sync';
  panelState.topicsOverviewOpen = true;
};

export const closeTopicsOverview = () => {
  panelState.topicsOverviewOpen = false;
};
