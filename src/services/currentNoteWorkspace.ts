import type {TaskHistoryEntry} from './taskHistory';

const rawValue = (task: TaskHistoryEntry, key: string) =>
  (task.raw as Record<string, unknown> | undefined)?.[key];

export const taskMatchesPath = (task: TaskHistoryEntry, path: string) => {
  if (!path) return false;
  const sourcePath = rawValue(task, 'sourcePath');
  const contextPath = rawValue(task, 'contextPath');
  const sourcePaths = rawValue(task, 'sourcePaths');
  const itemTitles = rawValue(task, 'itemTitles');
  const syncItems = rawValue(task, 'syncItems');

  if (sourcePath === path || contextPath === path) return true;
  if (Array.isArray(sourcePaths) && sourcePaths.includes(path)) return true;
  if (Array.isArray(itemTitles) && itemTitles.includes(path)) return true;
  if (
    Array.isArray(syncItems) &&
    syncItems.some(item => {
      if (!item || typeof item !== 'object') return false;
      const detail = item as Record<string, unknown>;
      return detail.title === path || detail.target === path;
    })
  ) {
    return true;
  }
  return task.content.includes(path) || task.description.includes(path);
};

export const filterTasksForPath = (tasks: TaskHistoryEntry[], path: string) =>
  tasks.filter(task => taskMatchesPath(task, path));
