/**
 * WiseMindAI -> Obsidian sync is hidden in v2.0.0 (one-way sync only).
 * The runner and wizard code stay in place; flip this to bring the entry points back.
 */
export const ENABLE_REVERSE_SYNC = false;

/** Minimum desktop version that ships the v2 local API (topics, workspaces, usage). */
export const MIN_CLIENT_VERSION = '2.0.0';

/** Feature keys reported by GET /api/capabilities. */
export const FEATURES = {
  workspace: 'workspace',
  topics: 'topics',
  usage: 'usage',
  fileSource: 'file-source',
  upsertTopics: 'upsert-topics',
  openSourceV2: 'open-source-v2',
  chatScope: 'chat-scope',
  chatHistory: 'chat-history',
  semanticSearch: 'semantic-search',
  quiz: 'quiz',
  taskPlan: 'task-plan',
  filesAiStatus: 'files-ai-status',
} as const;

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];

/** settingType values understood by the desktop OpenSetting event. */
export const CLIENT_SETTING_PAGES = {
  model: 'model',
  subscribe: 'subscribe',
} as const;

/** Returns a negative number when `a` is older than `b`; non-numeric parts count as 0. */
export const compareVersions = (a: string, b: string) => {
  const left = String(a || '').split(/[.-]/).map(part => Number.parseInt(part, 10) || 0);
  const right = String(b || '').split(/[.-]/).map(part => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(left.length, right.length, 3); index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff) return diff;
  }
  return 0;
};
