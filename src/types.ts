export type DuplicatePolicy = 'skip' | 'update' | 'duplicate';

export type SyncDirection = 'obsidian-to-wisemind' | 'wisemind-to-obsidian';

export type WiseMindResolvedLanguage = 'zh_CN' | 'en_US';

export type WiseMindLanguageSetting = 'system' | WiseMindResolvedLanguage;

export type TranscriptionScene = 'meeting' | 'class' | 'interview' | 'idea' | 'other';
export type TranscriptionStatus =
  | 'recording'
  | 'paused'
  | 'processing'
  | 'pending'
  | 'organized'
  | 'failed'
  | 'recoverable';
export type TranscriptionConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed';
export type TranscriptionMarkKind = 'highlight' | 'todo' | 'question';
export type TranscriptionCompletionAction = 'ask' | 'current-note' | 'new-note';

export type WiseMindTranscriptionSettings = {
  defaultScene: TranscriptionScene;
  defaultProviderId: string;
  defaultMicrophoneId: string;
  saveAudio: boolean;
  completionAction: TranscriptionCompletionAction;
};

export type TranscriptionMembershipQuota = {
  isPro: boolean;
  canStart: boolean;
  canGenerateSummary: boolean;
  canUseSpeakerDiarization: boolean;
  sessionLimitMinutes: number | null;
  monthlyLimitMinutes: number | null;
  monthlyUsedMs: number;
  monthlyRemainingMs: number | null;
  summaryMonthlyLimit: number | null;
  summaryMonthlyUsed: number;
};

export type TranscriptionStartOptions = {
  activeProviderId: string;
  providerType: string;
  providerName: string;
  modelName: string;
  providers: Array<{
    id: string;
    providerType: string;
    name: string;
    modelName: string;
    supportsSpeakerDiarization: boolean;
  }>;
  membership: TranscriptionMembershipQuota;
};

export type TranscriptionRecord = {
  id: string;
  title: string;
  scenario: TranscriptionScene;
  status: TranscriptionStatus;
  provider: string;
  model: string;
  workspaceId?: string | null;
  speakerDiarization?: boolean;
  speakerCount?: number;
  durationMs: number;
  wordCount: number;
  saveAudio: boolean;
  connectionStatus?: TranscriptionConnectionStatus;
  summary?: string;
  keyPoints?: string;
  todos?: string;
  startedAt?: number;
  endedAt?: number;
  created_at: number;
  updated_at: number;
};

export type TranscriptionSegment = {
  id: string;
  recordId: string;
  text: string;
  isFinal: boolean;
  beginTimeMs?: number;
  endTimeMs?: number;
  speakerId?: string;
  providerSpeakerId?: string;
  speakerLabel?: string;
  speakerConfidence?: number;
  speakerSource?: 'provider' | 'local' | 'reference' | 'user';
  sortOrder: number;
  created_at: number;
  updated_at: number;
};

export type TranscriptionSegmentUpdate = {
  id: string;
  speakerId?: string;
  speakerLabel?: string;
  speakerSource?: TranscriptionSegment['speakerSource'];
};

export type TranscriptionDetail = {
  record: TranscriptionRecord;
  segments: TranscriptionSegment[];
};

export type TranscriptionHistoryItem = {
  id: string;
  title: string;
  scenario: TranscriptionScene;
  provider: string;
  model: string;
  workspaceId?: string | null;
  durationMs: number;
  wordCount: number;
  speakerDiarization: boolean;
  speakerCount: number;
  summary: string;
  keyPoints: string;
  todos: string;
  segments: TranscriptionSegment[];
  startedAt?: number;
  createdAt: number;
  cachedAt: number;
};

export type TranscriptionOrganizeResult = {
  summary: string;
  keyPoints: string;
  todos: string;
};

export type TranscriptionRuntimeEvent =
  | {type: 'started'; record: TranscriptionRecord}
  | {type: 'partial'; recordId: string; text: string}
  | {type: 'segment'; recordId: string; segment: TranscriptionSegment}
  | {type: 'status'; recordId: string; status: TranscriptionStatus; durationMs?: number}
  | {
      type: 'connection';
      recordId: string;
      status: TranscriptionConnectionStatus;
      attempt?: number;
      bufferedMs?: number;
      errorCode?: string;
    }
  | {type: 'saved'; recordId: string; savedAt: number; durationMs?: number}
  | {type: 'audioLevel'; recordId: string; level: number}
  | {type: 'error'; recordId?: string; message: string; code?: string; recoverable?: boolean}
  | {type: 'membershipLimit'; recordId: string; reason: 'session' | 'monthly'};

export type ImportTargetSelection = {
  notes: boolean;
  documents: boolean;
  knowledge: boolean;
};

export type WiseMindSourceSelection = {
  notes: boolean;
  documents: boolean;
  knowledgeDocuments: boolean;
};

export type WiseMindContextMenuDefaults = {
  noteFolderPath: string;
  documentFolderPath: string;
  knowledgeBaseName: string;
};

export type WiseMindContextMenuRecents = {
  notes: string[];
  documents: string[];
  knowledge: string[];
};

export type WiseMindAssistantDefaults = {
  language: WiseMindLanguageSetting;
  summaryStyle: 'brief' | 'markdown' | 'structured';
  cardCount: number;
  cardDifficulty: 'basic' | 'standard' | 'advanced';
  cardStructure: 'concept' | 'qa' | 'mixed';
  defaultCardDeckName: string;
  defaultCardFolderName: string;
};

export type AssistantOpenChatSession = {
  id: string;
  title?: string;
  contextPath?: string;
  contextPaths?: string[];
  createdAt?: number;
  draftInput?: string;
  updatedAt: number;
};

export type SyncPlanDirection = 'to-wisemind' | 'to-obsidian';

export type SyncPlan = {
  id: string;
  name: string;
  direction: SyncPlanDirection;
  obsidianPaths: string[];
  obsidianFolders: string[];
  wiseMindDestinationKeys?: string[];
  obsidianTargetFolders?: string[];
  obsidianTargetFolder?: string;
  wiseMindKeys: string[];
  wiseMindGroupIds: string[];
  wiseMindCategory: 'documents' | 'knowledge' | 'notes';
  importTargets: ImportTargetSelection;
  updatedAt: number;
};

export type SyncHistoryItem = {
  id: string;
  createdAt: number;
  direction: SyncPlanDirection;
  sourceLabel: string;
  targetLabel: string;
  sourceFolders: string[];
  targetFolders: string[];
  itemTitles: string[];
  syncItems?: Array<{
    title: string;
    target: string;
    status: SyncItemResult['status'];
  }>;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

export type WiseMindImportSettings = {
  apiBaseUrl: string;
  defaultTargets: ImportTargetSelection;
  defaultWiseMindSources: WiseMindSourceSelection;
  showContextMenu: boolean;
  contextMenuDefaults: WiseMindContextMenuDefaults;
  contextMenuRecents: WiseMindContextMenuRecents;
  assistantDefaults: WiseMindAssistantDefaults;
  transcription: WiseMindTranscriptionSettings;
  transcriptionHistory: TranscriptionHistoryItem[];
  assistantSummaryHistory: AssistantSummaryHistoryItem[];
  assistantCardHistory: AssistantCardHistoryItem[];
  assistantChatSessions: AssistantChatSession[];
  assistantOpenChatSessionIds: string[];
  assistantOpenChatSessions: AssistantOpenChatSession[];
  syncPlans: SyncPlan[];
  syncHistory: SyncHistoryItem[];
  defaultSyncPlanId: string;
  hasSeenTutorial: boolean;
  defaultKnowledgeBaseName: string;
  defaultObsidianRootFolder: string;
  duplicatePolicy: DuplicatePolicy;
  maxFileSizeKb: number;
  mentionNoteLimit: number;
  ignorePatterns: string[];
  chunkSize: number;
};

export type AssistantSummaryDraft = {
  title: string;
  summaryTitle?: string;
  markdown: string;
  tags: string[];
  sourceTitle?: string;
  sourcePath?: string;
  sourceKind?: 'current-note' | 'selection' | 'multi-note';
  sourcePaths?: string[];
};

export type AssistantCardDraft = {
  content: string;
  tags: string[];
  type?: string;
};

export type AssistantSummaryHistoryItem = AssistantSummaryDraft & {
  id: string;
  createdAt: number;
};

export type AssistantCardHistoryItem = {
  id: string;
  createdAt: number;
  title: string;
  sourceTitle?: string;
  sourcePath?: string;
  sourceKind?: 'current-note' | 'selection' | 'multi-note';
  sourcePaths?: string[];
  cards: AssistantCardDraft[];
};

export type AssistantChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
};

export type AssistantChatSession = {
  id: string;
  title: string;
  contextPath: string;
  contextPaths?: string[];
  messages: AssistantChatMessage[];
  createdAt: number;
  updatedAt: number;
};

export type ObsidianSourceItem = {
  path: string;
  absolutePath?: string;
  basename: string;
  folderPath: string;
  title: string;
  markdown: string;
  plainText: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
  modifiedAt: number;
  size: number;
  contentHash: string;
};

export type WiseMindSourceType = 'note' | 'document' | 'knowledge-document';

export type WiseMindSourceItem = {
  sourceType: WiseMindSourceType;
  id: number | string;
  title: string;
  markdown: string;
  plainText: string;
  tags: string[];
  folderPath: string;
  updatedAt?: string | number;
  contentHash: string;
  knowledgeBaseName?: string;
  raw?: Record<string, unknown>;
};

export type SyncItemResult = {
  title: string;
  source: string;
  target?: string;
  status: 'created' | 'updated' | 'skipped' | 'failed';
  message?: string;
};

export type SyncRunResult = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  items: SyncItemResult[];
};

export type SyncStatus = 'unsynced' | 'synced' | 'remote-newer' | 'local-newer';

export type WiseMindFolder = {
  id: number | string;
  name: string;
  from_folder?: string | null;
};

export type WiseMindSnapshot = {
  notes: any[];
  noteFolders: WiseMindFolder[];
  documents: any[];
  documentFolders: WiseMindFolder[];
  knowledgeBases: any[];
  knowledgeDocuments: any[];
};

export type WiseMindWorkspaceState = {
  activeWorkspaceId: string | null;
  defaultWorkspaceId: string | null;
  workspaces: Array<{
    id: string;
    name: string;
    folderPath?: string;
    isDefault?: boolean | number;
    status?: string;
  }>;
};
