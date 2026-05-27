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

export const taskTypeOptions: Array<{value: TaskHistoryType; label: string}> = [
  {value: 'all', label: '全部'},
  {value: 'summary', label: '总结'},
  {value: 'cards', label: '知识卡片'},
  {value: 'chat', label: 'AI 对话'},
  {value: 'sync', label: '同步'},
];

export const taskTypeLabel = (type: TaskHistoryTarget) => {
  if (type === 'summary') return '总结任务';
  if (type === 'cards') return '知识卡片';
  if (type === 'chat') return 'AI 对话';
  return '同步任务';
};

export const taskTargetPage = (type: TaskHistoryTarget) => {
  if (type === 'summary') return 'summary';
  if (type === 'cards') return 'cards';
  if (type === 'chat') return 'chat';
  return 'sync';
};

export const buildTaskHistory = (settings: WiseMindImportSettings): TaskHistoryEntry[] =>
  [
    ...(settings.assistantSummaryHistory ?? []).map(item => ({
      id: item.id,
      type: 'summary' as const,
      title: item.sourceTitle || item.title || '文档总结',
      description: item.sourceTitle || item.sourcePath || '总结任务',
      content: `${item.title || ''} ${item.markdown || ''} ${(item.tags || []).join(' ')}`,
      createdAt: item.createdAt,
      raw: item,
    })),
    ...(settings.assistantCardHistory ?? []).map(item => ({
      id: item.id,
      type: 'cards' as const,
      title: item.title || item.sourceTitle || '知识卡片',
      description: `${item.cards?.length || 0} 张卡片`,
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
        title: item.title || 'AI 对话',
        description: item.contextPath || `${item.messages?.length || 0} 条消息`,
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
      description: `新建 ${item.created} / 更新 ${item.updated} / 跳过 ${item.skipped} / 失败 ${item.failed}`,
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
