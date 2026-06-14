import type {
  AssistantCardHistoryItem,
  AssistantChatSession,
  AssistantSummaryHistoryItem,
  SyncHistoryItem,
  WiseMindImportSettings,
} from '../types';

export const WISEMIND_TASK_HISTORY_UPDATED_EVENT = 'wisemindai:task-history-updated';

export const notifyTaskHistoryUpdated = () => {
  window.dispatchEvent(new CustomEvent(WISEMIND_TASK_HISTORY_UPDATED_EVENT));
};

export type TaskHistoryType = 'all' | 'summary' | 'cards' | 'chat' | 'sync';
export type TaskHistoryTarget = Exclude<TaskHistoryType, 'all'>;

export type TaskHistoryEntry = {
  id: string;
  type: TaskHistoryTarget;
  title: string;
  description: string;
  content: string;
  createdAt: number;
  raw: AssistantSummaryHistoryItem | AssistantCardHistoryItem | AssistantChatSession | SyncHistoryItem;
};

export type TaskHistoryLabels = {
  all: string;
  summary: string;
  cards: string;
  chat: string;
  sync: string;
  summaryTask: string;
  cardsTask: string;
  chatTask: string;
  syncTask: string;
  summaryTitle: string;
  cardsTitle: string;
  cardCount: (count: number) => string;
  chatTitle: string;
  messageCount: (count: number) => string;
  syncDescription: (item: Pick<SyncHistoryItem, 'created' | 'updated' | 'skipped' | 'failed'>) => string;
};

export const defaultTaskHistoryLabels: TaskHistoryLabels = {
  all: 'All',
  summary: 'Summary',
  cards: 'Knowledge cards',
  chat: 'AI chat',
  sync: 'Sync',
  summaryTask: 'Summary task',
  cardsTask: 'Knowledge cards',
  chatTask: 'AI chat',
  syncTask: 'Sync task',
  summaryTitle: 'Document summary',
  cardsTitle: 'Knowledge cards',
  cardCount: count => `${count} cards`,
  chatTitle: 'AI chat',
  messageCount: count => `${count} messages`,
  syncDescription: item =>
    `Created ${item.created} / updated ${item.updated} / skipped ${item.skipped} / failed ${item.failed}`,
};

export const taskTypeOptions: Array<{value: TaskHistoryType; label: string}> = [
  {value: 'all', label: defaultTaskHistoryLabels.all},
  {value: 'summary', label: defaultTaskHistoryLabels.summary},
  {value: 'cards', label: defaultTaskHistoryLabels.cards},
  {value: 'chat', label: defaultTaskHistoryLabels.chat},
  {value: 'sync', label: defaultTaskHistoryLabels.sync},
];

export const taskTypeLabel = (
  type: TaskHistoryTarget,
  labels: TaskHistoryLabels = defaultTaskHistoryLabels,
) => {
  if (type === 'summary') return labels.summaryTask;
  if (type === 'cards') return labels.cardsTask;
  if (type === 'chat') return labels.chatTask;
  return labels.syncTask;
};

export const taskTargetPage = (type: TaskHistoryTarget) => {
  if (type === 'summary') return 'summary';
  if (type === 'cards') return 'cards';
  if (type === 'chat') return 'chat';
  return 'sync';
};

export const buildTaskHistory = (
  settings: WiseMindImportSettings,
  labels: TaskHistoryLabels = defaultTaskHistoryLabels,
): TaskHistoryEntry[] =>
  [
    ...(settings.assistantSummaryHistory ?? []).map(item => ({
      id: item.id,
      type: 'summary' as const,
      title: item.sourceTitle || item.title || labels.summaryTitle,
      description: item.sourceTitle || item.sourcePath || labels.summaryTask,
      content: `${item.title || ''} ${item.markdown || ''} ${(item.tags || []).join(' ')}`,
      createdAt: item.createdAt,
      raw: item,
    })),
    ...(settings.assistantCardHistory ?? []).map(item => ({
      id: item.id,
      type: 'cards' as const,
      title: item.title || item.sourceTitle || labels.cardsTitle,
      description: labels.cardCount(item.cards?.length || 0),
      content: `${item.title || ''} ${item.sourceTitle || ''} ${(item.cards || [])
        .map(card => `${card.content} ${(card.tags || []).join(' ')}`)
        .join(' ')}`,
      createdAt: item.createdAt,
      raw: item,
    })),
    ...(settings.assistantChatSessions ?? [])
      .filter(item => item.messages?.length)
      .map(item => ({
        id: item.id,
        type: 'chat' as const,
        title: item.title || labels.chatTitle,
        description: item.contextPath || labels.messageCount(item.messages?.length || 0),
        content: `${item.title || ''} ${item.contextPath || ''} ${(item.messages || [])
          .map(message => message.content)
          .join(' ')}`,
        createdAt: item.updatedAt || item.createdAt,
        raw: item,
      })),
    ...(settings.syncHistory ?? []).map(item => ({
      id: item.id,
      type: 'sync' as const,
      title: `${item.sourceLabel} -> ${item.targetLabel}`,
      description: labels.syncDescription(item),
      content: `${item.sourceLabel} ${item.targetLabel} ${(item.itemTitles || []).join(' ')} ${(item.syncItems || [])
        .map(detail => `${detail.title} ${detail.target}`)
        .join(' ')}`,
      createdAt: item.createdAt,
      raw: item,
    })),
  ].sort((a, b) => b.createdAt - a.createdAt);

export const matchesTaskSearch = (task: TaskHistoryEntry, query: string) => {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return true;
  return `${task.title} ${task.description} ${task.content}`.toLowerCase().includes(keyword);
};
