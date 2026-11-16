import {mentionToken} from './mentionText';
import type {MentionTextSegment} from './types';

/** Length of a composer child node in the plain-text input, where a mention badge counts as `@path`. */
const nodeInputLength = (node: Node) => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length || 0;
  if (node instanceof HTMLElement && node.dataset.mentionPath) {
    return mentionToken(node.dataset.mentionPath).length;
  }
  return node.textContent?.length || 0;
};

export const readEditorText = (el: HTMLElement) =>
  Array.from(el.childNodes)
    .map(node => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
      if (node instanceof HTMLElement && node.dataset.mentionPath) {
        return mentionToken(node.dataset.mentionPath);
      }
      if (node.nodeName === 'BR') return '\n';
      return node.textContent || '';
    })
    .join('')
    .replace(/\u00a0/g, ' ');

/** Caret offset in the plain-text input, or `fallback` when the selection is outside the editor. */
export const getEditorCursorOffset = (el: HTMLElement | null, fallback: number) => {
  const selection = window.getSelection();
  if (!el || !selection?.anchorNode || !el.contains(selection.anchorNode)) {
    return fallback;
  }

  let offset = 0;
  const anchorNode = selection.anchorNode;
  const anchorOffset = selection.anchorOffset;
  const children = Array.from(el.childNodes);

  if (anchorNode === el) {
    return children.slice(0, anchorOffset).reduce((sum, node) => sum + nodeInputLength(node), 0);
  }

  for (const child of children) {
    if (child === anchorNode) {
      return offset + anchorOffset;
    }
    if (child.contains(anchorNode)) {
      return offset + (anchorOffset > 0 ? nodeInputLength(child) : 0);
    }
    offset += nodeInputLength(child);
  }

  return fallback;
};

export const setEditorCursorOffset = (el: HTMLElement | null, targetOffset: number) => {
  const selection = window.getSelection();
  if (!el || !selection) return;
  const range = document.createRange();
  const children = Array.from(el.childNodes);
  let offset = 0;

  for (const child of children) {
    const length = nodeInputLength(child);
    if (targetOffset <= offset + length) {
      if (child.nodeType === Node.TEXT_NODE) {
        range.setStart(child, Math.max(0, Math.min(targetOffset - offset, length)));
      } else if (targetOffset <= offset) {
        range.setStartBefore(child);
      } else {
        range.setStartAfter(child);
      }
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    offset += length;
  }

  range.selectNodeContents(el);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
};

/** Replaces the editor content with text nodes and non-editable mention badges. */
export const renderEditorSegments = (el: HTMLElement, segments: MentionTextSegment[]) => {
  el.replaceChildren();
  segments.forEach(segment => {
    if (segment.type === 'text') {
      el.append(document.createTextNode(segment.text));
      return;
    }
    const badge = document.createElement('span');
    badge.className = 'wm-mention-badge';
    badge.contentEditable = 'false';
    badge.dataset.mentionPath = segment.path;
    badge.title = segment.path;
    const label = document.createElement('span');
    label.className = 'wm-mention-badge-label';
    label.textContent = segment.title;
    badge.append(label);
    el.append(badge);
  });
};
