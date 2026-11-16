export type DiffPart = {
  type: 'same' | 'added' | 'removed';
  text: string;
};

/** Above this many LCS cells the diff is skipped, keeping the UI responsive for long selections. */
const MAX_DIFF_CELLS = 1_500_000;
const TOKEN_PATTERN = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]|[A-Za-z0-9_]+|\s+|[^\sA-Za-z0-9_]/g;

/** CJK characters are compared one by one; other scripts by word, whitespace, or punctuation. */
export const tokenizeForDiff = (text: string) => text.match(TOKEN_PATTERN) || [];

const pushPart = (parts: DiffPart[], type: DiffPart['type'], text: string) => {
  const last = parts[parts.length - 1];
  if (last?.type === type) last.text += text;
  else parts.push({type, text});
};

export const diffText = (before: string, after: string): DiffPart[] | null => {
  const a = tokenizeForDiff(before);
  const b = tokenizeForDiff(after);
  if ((a.length + 1) * (b.length + 1) > MAX_DIFF_CELLS) return null;

  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pushPart(parts, 'same', a[i]);
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      pushPart(parts, 'removed', a[i]);
      i += 1;
    } else {
      pushPart(parts, 'added', b[j]);
      j += 1;
    }
  }
  while (i < a.length) pushPart(parts, 'removed', a[i++]);
  while (j < b.length) pushPart(parts, 'added', b[j++]);
  return parts;
};

/** Accepts "#a #b", "a, b", or one tag per line; returns tags without the leading "#". */
export const parseGeneratedTags = (raw: string) => {
  const hashTags = raw.match(/#[^\s#,]+/g);
  const values = hashTags?.length ? hashTags : raw.split(/[,\n]+/);
  const tags = values
    .map(value => value.replace(/^#/, '').trim().replace(/\s+/g, '-'))
    .filter(Boolean);
  return [...new Set(tags)].slice(0, 12);
};

export const mergeFrontmatterTags = (existing: unknown, added: string[]) => {
  const current = Array.isArray(existing)
    ? existing.map(String)
    : typeof existing === 'string'
      ? existing.split(/[,\s]+/)
      : [];
  const normalized = current.map(tag => tag.replace(/^#/, '').trim()).filter(Boolean);
  const merged = [...normalized];
  added.forEach(tag => {
    if (!merged.some(item => item.toLowerCase() === tag.toLowerCase())) merged.push(tag);
  });
  return {tags: merged, addedCount: merged.length - normalized.length};
};
