export type RelatedCandidate = {
  path: string;
  title: string;
  folderPath: string;
  tags: string[];
  modifiedAt: number;
};

export type RelatedNote = RelatedCandidate & {
  score: number;
  linked: boolean;
  sharedTag: string;
  sameFolder: boolean;
};

const LINK_SCORE = 3;
const TAG_SCORE = 2;
const FOLDER_SCORE = 1;

export const normalizeTag = (tag: string) => tag.replace(/^#/, '').trim().toLowerCase();

/** Collects tags from both the note body and the frontmatter `tags` / `tag` properties. */
export const collectNoteTags = (cache?: {
  tags?: {tag: string}[];
  frontmatter?: Record<string, unknown>;
} | null) => {
  const tags = new Set<string>();
  cache?.tags?.forEach(item => tags.add(normalizeTag(item.tag)));
  const raw = cache?.frontmatter?.tags ?? cache?.frontmatter?.tag;
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,\s]+/) : [];
  values.forEach(value => {
    const tag = normalizeTag(String(value || ''));
    if (tag) tags.add(tag);
  });
  return [...tags];
};

export const rankRelatedNotes = (options: {
  activePath: string;
  activeTags: string[];
  linkedPaths: Set<string>;
  candidates: RelatedCandidate[];
  limit?: number;
}): RelatedNote[] => {
  const activeFolder = options.activePath.includes('/')
    ? options.activePath.slice(0, options.activePath.lastIndexOf('/'))
    : '';
  const activeTags = new Set(options.activeTags.map(normalizeTag));
  const ranked: RelatedNote[] = [];

  for (const note of options.candidates) {
    if (note.path === options.activePath) continue;
    const linked = options.linkedPaths.has(note.path);
    const sharedTags = note.tags.filter(tag => activeTags.has(normalizeTag(tag)));
    const sameFolder = Boolean(activeFolder) && note.folderPath === activeFolder;
    const score = (linked ? LINK_SCORE : 0) + sharedTags.length * TAG_SCORE + (sameFolder ? FOLDER_SCORE : 0);
    if (score <= 0) continue;
    ranked.push({...note, score, linked, sharedTag: sharedTags[0] || '', sameFolder});
  }

  return ranked
    .sort((a, b) => b.score - a.score || b.modifiedAt - a.modifiedAt)
    .slice(0, options.limit ?? 6);
};
