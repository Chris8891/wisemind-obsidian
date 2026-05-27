import {computed, reactive} from 'vue';

export type PluginTaskStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export type PluginTaskProgress = {
  id: string;
  title: string;
  status: PluginTaskStatus;
  total?: number;
  completed?: number;
  message?: string;
  updatedAt: number;
};

export const pluginTaskProgress = reactive<{tasks: PluginTaskProgress[]}>({
  tasks: [],
});

export const runningPluginTask = computed(
  () => pluginTaskProgress.tasks.find(task => task.status === 'running') || null,
);

export const upsertPluginTask = (
  task: Omit<PluginTaskProgress, 'updatedAt'> & {updatedAt?: number},
) => {
  const next = {...task, updatedAt: task.updatedAt || Date.now()};
  const index = pluginTaskProgress.tasks.findIndex(item => item.id === task.id);
  if (index === -1) pluginTaskProgress.tasks.unshift(next);
  else pluginTaskProgress.tasks[index] = {...pluginTaskProgress.tasks[index], ...next};
  pluginTaskProgress.tasks = pluginTaskProgress.tasks
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 20);
};
