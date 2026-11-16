import type {MentionTextSegment} from './types';

export const titleFromPath = (path: string) =>
  path.replace(/\.md$/i, '').split('/').pop() || path;

export const mentionToken = (path: string) => `@${path}`;

/**
 * Splits text into plain runs and `@path` mentions of known notes.
 * `notePaths` must be sorted longest first so a path never matches as a prefix of a longer one.
 */
export const tokenizeMentionText = (
  text: string,
  notePaths: string[],
  titleOf: (path: string) => string | undefined,
): MentionTextSegment[] => {
  if (!text) return [];
  if (!text.includes('@')) return [{type: 'text', text, start: 0, end: text.length}];
  const segments: MentionTextSegment[] = [];
  let index = 0;
  let textBuffer = '';
  let textStart = 0;

  const flushText = (end: number) => {
    if (!textBuffer) return;
    segments.push({type: 'text', text: textBuffer, start: textStart, end});
    textBuffer = '';
  };

  while (index < text.length) {
    let matchedPath = '';
    if (text[index] === '@') {
      matchedPath =
        notePaths.find(path => {
          const token = mentionToken(path);
          if (!text.startsWith(token, index)) return false;
          const nextChar = text[index + token.length];
          return !nextChar || /\s/.test(nextChar);
        }) || '';
    }

    if (matchedPath) {
      flushText(index);
      const start = index;
      const end = index + mentionToken(matchedPath).length;
      segments.push({
        type: 'mention',
        path: matchedPath,
        title: titleOf(matchedPath) || titleFromPath(matchedPath),
        start,
        end,
      });
      index = end;
      textStart = index;
      continue;
    }

    if (!textBuffer) textStart = index;
    textBuffer += text[index];
    index += 1;
  }
  flushText(text.length);
  return segments;
};

/** Returns the `@query` being typed right before the cursor, if any. */
export const findActiveMention = (text: string, cursor: number) => {
  const before = text.slice(0, cursor);
  const lineStart = Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r')) + 1;
  const lineBeforeCursor = before.slice(lineStart);
  const atIndex = lineBeforeCursor.lastIndexOf('@');
  if (atIndex === -1) return null;
  if (atIndex > 0 && !/\s/.test(lineBeforeCursor[atIndex - 1])) return null;
  const queryText = lineBeforeCursor.slice(atIndex + 1);
  if (/\s/.test(queryText)) return null;
  return {
    start: lineStart + atIndex,
    query: queryText,
  };
};
