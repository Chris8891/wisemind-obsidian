import type {ObsidianSourceItem} from '../types';

export type NoteMentionSearchItem = Pick<
  ObsidianSourceItem,
  'title' | 'path' | 'folderPath' | 'tags' | 'modifiedAt'
> & {
  aliases?: string[];
};

export type NoteMentionCandidate = {
  title: string;
  path: string;
  folderPath: string;
  tags: string[];
  insertText: string;
  matchScore: number;
  matchReason: string;
  modifiedAt?: number;
};

export type NoteMentionSearchLabels = {
  title: string;
  alias: string;
  path: string;
  tag: string;
  folder: string;
};

const defaultLabels: NoteMentionSearchLabels = {
  title: 'Title match',
  alias: 'Alias match',
  path: 'Path match',
  tag: 'Tag match',
  folder: 'Folder match',
};

const lower = (value: unknown) => String(value || '').toLowerCase();

const titleFromPath = (path: string) => path.replace(/\.md$/i, '').split('/').pop() || path;

const scoreText = (value: unknown, keyword: string, score: number) => {
  if (!keyword) return 1;
  const text = lower(value);
  if (!text) return 0;
  if (text === keyword) return score + 20;
  if (text.startsWith(keyword)) return score + 10;
  if (text.includes(keyword)) return score;
  return 0;
};

export const searchNoteMentions = (
  notes: NoteMentionSearchItem[],
  query: string,
  limit = 0,
  labels: NoteMentionSearchLabels = defaultLabels,
): NoteMentionCandidate[] => {
  const keyword = lower(query).trim();
  const safeLimit = Math.max(0, Math.floor(Number(limit || 0)));

  const candidates = notes
    .map(note => {
      const title = note.title || titleFromPath(note.path);
      const aliases = Array.isArray(note.aliases) ? note.aliases : [];
      const candidates = [
        {reason: labels.title, score: scoreText(title, keyword, 100)},
        {reason: labels.alias, score: scoreText(aliases.join(' '), keyword, 90)},
        {reason: labels.path, score: scoreText(note.path, keyword, 70)},
        {reason: labels.tag, score: scoreText((note.tags || []).join(' '), keyword, 60)},
        {reason: labels.folder, score: scoreText(note.folderPath, keyword, 50)},
      ].sort((a, b) => b.score - a.score);
      const best = candidates[0] || {reason: '', score: 0};

      return {
        title,
        path: note.path,
        folderPath: note.folderPath || '',
        tags: note.tags || [],
        insertText: `@${note.path} `,
        matchScore: best.score,
        matchReason: keyword ? best.reason : '',
        modifiedAt: note.modifiedAt,
      };
    })
    .filter(item => !keyword || item.matchScore > 0)
    .sort(
      (a, b) =>
        b.matchScore - a.matchScore ||
        Number(b.modifiedAt || 0) - Number(a.modifiedAt || 0) ||
        a.title.localeCompare(b.title),
    );

  return safeLimit > 0 ? candidates.slice(0, safeLimit) : candidates;
};
