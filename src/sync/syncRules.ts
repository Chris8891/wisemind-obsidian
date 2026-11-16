import type {SyncRecord, SyncRule, WiseMindAccountUsage} from '../types';

export type SyncNoteRef = {
  path: string;
  tags: string[];
  frontmatter?: Record<string, unknown> | null;
};

export type SyncStat = {mtime: number; size: number};

export type SyncClassification = 'new' | 'changed' | 'unchanged' | 'held';

export const normalizeFolder = (value: string) =>
  String(value || '').trim().replace(/^\/+|\/+$/g, '');

export const normalizeTag = (value: string) => String(value || '').trim().replace(/^#/, '');

/** Folder rules match by path prefix; tag rules also match nested tags (`study` covers `study/os`). */
export const ruleMatches = (rule: SyncRule, note: SyncNoteRef) => {
  if (!rule.enabled) return false;
  if (rule.kind === 'tag') {
    const tag = normalizeTag(rule.value).toLowerCase();
    if (!tag) return false;
    return note.tags.some(item => {
      const value = normalizeTag(item).toLowerCase();
      return value === tag || value.startsWith(`${tag}/`);
    });
  }
  const folder = normalizeFolder(rule.value);
  const parent = note.path.includes('/') ? note.path.slice(0, note.path.lastIndexOf('/')) : '';
  if (!folder) return rule.includeSubfolders || parent === '';
  if (rule.includeSubfolders) return parent === folder || parent.startsWith(`${folder}/`);
  return parent === folder;
};

export const matchingRules = (rules: SyncRule[], note: SyncNoteRef) => rules.filter(rule => ruleMatches(rule, note));

/** Whether a rule should keep auto-adding topic links for newly matching notes. */
export const ruleAutoJoinsTopics = (rule: SyncRule) => {
  if (!rule.knowledgeBaseIds.length) return false;
  if (rule.kind === 'folder') return rule.keepFolderInSync !== false;
  if (rule.kind === 'tag') return rule.autoJoinByTag !== false;
  return true;
};

/** Topic ids from every matching rule that auto-joins topics, de-duplicated and in rule order. */
export const topicIdsFor = (rules: SyncRule[]) => {
  const ids = new Set<number>();
  rules.forEach(rule => {
    if (!ruleAutoJoinsTopics(rule)) return;
    rule.knowledgeBaseIds.forEach(id => Number.isFinite(id) && id > 0 && ids.add(id));
  });
  return [...ids];
};

const matchPattern = (path: string, pattern: string) => {
  if (!pattern) return false;
  if (pattern.startsWith('**/')) {
    const segment = pattern.slice(3).replace(/\/\*\*$/, '');
    return path === segment || path.startsWith(`${segment}/`) || path.includes(`/${segment}/`) || path.endsWith(`/${segment}`);
  }
  if (pattern.endsWith('/**')) return path.startsWith(pattern.slice(0, -2));
  return path === pattern || path.startsWith(`${pattern}/`);
};

export const isPathIgnored = (path: string, patterns: string[]) =>
  patterns.some(pattern => matchPattern(path, String(pattern || '').trim()));

export const isPrivateNote = (frontmatter?: Record<string, unknown> | null) => {
  const value = frontmatter?.private;
  return value === true || String(value).toLowerCase() === 'true';
};

/** Excluded notes never leave the device: neither sync nor AI requests may use them. */
export const isNoteExcluded = (
  note: SyncNoteRef,
  options: {ignorePatterns: string[]; respectPrivate: boolean},
) => isPathIgnored(note.path, options.ignorePatterns) || (options.respectPrivate && isPrivateNote(note.frontmatter));

/** A matching size and mtime means the note is untouched, so its content is never read or hashed. */
export const needsHash = (stat: SyncStat, record?: SyncRecord | null) =>
  Boolean(record && !record.held && (record.mtime !== stat.mtime || record.size !== stat.size));

export const classifyByStat = (stat: SyncStat, record?: SyncRecord | null): SyncClassification | null => {
  if (!record) return 'new';
  if (record.held) return 'held';
  if (!needsHash(stat, record)) return 'unchanged';
  return null;
};

export const classifyByHash = (hash: string, record?: SyncRecord | null): SyncClassification => {
  if (!record) return 'new';
  if (record.held) return 'held';
  return hash === record.contentHash ? 'unchanged' : 'changed';
};

/**
 * WiseMindAI changed the file since the last sync and it no longer matches the local note.
 * Without a stored remote hash the update time is the only signal.
 */
export const hasRemoteConflict = (
  record: SyncRecord | null | undefined,
  remote: {contentHash: string; updatedAt?: number | string | null},
  localHash: string,
) => {
  if (!record?.remoteId) return false;
  if (remote.contentHash === localHash) return false;
  if (record.remoteContentHash) return remote.contentHash !== record.remoteContentHash;
  if (record.remoteUpdatedAt === null || record.remoteUpdatedAt === undefined) return false;
  return String(remote.updatedAt ?? '') !== String(record.remoteUpdatedAt);
};

/** Topics the note should be in but has not been added to yet; topics are only ever added, never removed. */
export const missingTopicIds = (wanted: number[], applied?: number[] | null) => {
  const done = new Set(applied || []);
  return wanted.filter(id => !done.has(id));
};

/** Topic ids the desktop accepted from an upsert (created, or skipped as an existing copy). */
export const acceptedTopicIds = (results?: Array<{knowledgeBaseId: number | string; ok: boolean}> | null) =>
  (results || []).filter(item => item.ok).map(item => Number(item.knowledgeBaseId)).filter(id => id > 0);

/**
 * A renamed or moved note keeps its WiseMindAI file: the remote id stays and the cleared hash makes
 * the next run send the new name and path as an update instead of creating a second copy.
 */
export const renamedRecord = (record: SyncRecord): SyncRecord => ({...record, contentHash: '', mtime: 0});

/** Separates the learning space from the note path in sync index keys; it never appears in a path. */
const SCOPE_SEPARATOR = '\u0000';

export const scopedKey = (scope: string, path: string) => (scope ? `${scope}${SCOPE_SEPARATOR}${path}` : path);

export const splitScopedKey = (key: string) => {
  const at = key.indexOf(SCOPE_SEPARATOR);
  return at < 0 ? {scope: '', path: key} : {scope: key.slice(0, at), path: key.slice(at + 1)};
};

/** Remaining slots for one usage key; null means unlimited or unknown. */
export const remainingQuota = (usage: WiseMindAccountUsage | null | undefined, key = 'fileCount') => {
  const item = usage?.items?.find(entry => entry.key === key);
  if (!item || item.limit === null || item.limit === undefined) return null;
  return Math.max(0, Number(item.limit) - Number(item.usage || 0));
};

export const chunk = <T>(items: T[], size: number) => {
  const result: T[][] = [];
  const step = Math.max(1, Math.floor(size));
  for (let index = 0; index < items.length; index += step) result.push(items.slice(index, index + step));
  return result;
};

/** Runs `worker` over `items` with at most `concurrency` in flight; stops picking new items once aborted. */
export const runPool = async <T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal,
) => {
  let next = 0;
  const lanes = Array.from({length: Math.max(1, Math.min(concurrency, items.length))}, async () => {
    while (next < items.length && !signal?.aborted) {
      const index = next;
      next += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(lanes);
};
