import {nextTick, ref} from 'vue';

import type {NoteMentionCandidate} from '../../../services/noteMentionSearch';

import {
  getEditorCursorOffset,
  readEditorText,
  renderEditorSegments,
  setEditorCursorOffset,
} from './composerDom';
import {findActiveMention, mentionToken} from './mentionText';
import type {ComposerInputOptions, MentionTextSegment} from './types';
import type {ChatNoteIndex} from './useChatContext';

type MentionSegment = Extract<MentionTextSegment, {type: 'mention'}>;

/**
 * State and editing logic of the contenteditable composer: plain-text input with `@path`
 * mentions rendered as badges, the mention picker and keyboard handling.
 */
export const useChatComposer = (options: {
  noteIndex: ChatNoteIndex;
  /** Copies the current input into the active session's draft. */
  syncDraft: () => void;
  /** Debounced save of the open sessions (including drafts). */
  schedulePersist: () => void;
  submit: () => void;
}) => {
  const {noteIndex, syncDraft, schedulePersist, submit} = options;
  const input = ref('');
  const inputEl = ref<HTMLDivElement | null>(null);
  const mentionOpen = ref(false);
  const mentionActiveIndex = ref(0);

  const getCursorOffset = () => getEditorCursorOffset(inputEl.value, input.value.length);

  const renderComposerInput = async (cursorOffset = input.value.length) => {
    await nextTick();
    const el = inputEl.value;
    if (!el) return;
    const wasFocused = document.activeElement === el;
    renderEditorSegments(el, noteIndex.tokenize(input.value));
    if (wasFocused) setEditorCursorOffset(el, cursorOffset);
  };

  const setComposerInput = (value: string, opts: ComposerInputOptions = {}) => {
    input.value = value;
    const cursor = opts.cursor ?? value.length;
    void renderComposerInput(cursor).then(() => {
      if (!opts.focus) return;
      inputEl.value?.focus();
      setEditorCursorOffset(inputEl.value, cursor);
    });
  };

  const focusComposer = () => {
    void nextTick(() => {
      const el = inputEl.value;
      if (!el || document.activeElement === el) return;
      el.focus();
      setEditorCursorOffset(el, input.value.length);
    });
  };

  const insertComposerText = (text: string) => {
    const cursor = getCursorOffset();
    input.value = `${input.value.slice(0, cursor)}${text}${input.value.slice(cursor)}`;
    syncDraft();
    mentionOpen.value = false;
    void renderComposerInput(cursor + text.length);
    schedulePersist();
  };

  const removeMentionAroundCursor = (direction: 'backward' | 'forward') => {
    const cursor = getCursorOffset();
    const segments = noteIndex
      .tokenize(input.value)
      .filter((segment): segment is MentionSegment => segment.type === 'mention');
    const mention = segments.find(segment => {
      if (direction === 'backward') {
        return (
          cursor === segment.end ||
          (cursor === segment.end + 1 && input.value[segment.end] === ' ') ||
          (cursor > segment.start && cursor <= segment.end)
        );
      }
      return cursor === segment.start || (cursor >= segment.start && cursor < segment.end);
    });
    if (!mention) return false;

    const removeEnd =
      input.value[mention.end] === ' ' || input.value[mention.end] === '\n'
        ? mention.end + 1
        : mention.end;
    input.value = `${input.value.slice(0, mention.start)}${input.value.slice(removeEnd)}`;
    syncDraft();
    mentionOpen.value = false;
    void renderComposerInput(mention.start);
    schedulePersist();
    return true;
  };

  const triggerMention = () => {
    const cursor = getCursorOffset();
    const previous = input.value[cursor - 1];
    const token = previous && !/\s/.test(previous) ? ' @' : '@';
    const next = `${input.value.slice(0, cursor)}${token}${input.value.slice(cursor)}`;
    setComposerInput(next, {focus: true, cursor: cursor + token.length});
    syncDraft();
    noteIndex.query.value = '';
    mentionActiveIndex.value = 0;
    mentionOpen.value = true;
    schedulePersist();
  };

  const onInput = () => {
    const cursor = getCursorOffset();
    if (inputEl.value) input.value = readEditorText(inputEl.value);
    const mention = findActiveMention(input.value, cursor);
    mentionOpen.value = Boolean(mention);
    noteIndex.query.value = mention?.query || '';
    mentionActiveIndex.value = 0;
    syncDraft();
    schedulePersist();
  };

  const pickMentionCandidate = async (candidate: NoteMentionCandidate) => {
    const composer = inputEl.value;
    if (!composer) return;
    const cursor = getCursorOffset();
    const after = input.value.slice(cursor);
    const mention = findActiveMention(input.value, cursor);
    const start = mention?.start ?? cursor;
    const insertText = `${mentionToken(candidate.path)} `;
    input.value = `${input.value.slice(0, start)}${insertText}${after}`;
    syncDraft();
    mentionOpen.value = false;
    await nextTick();
    composer.focus();
    await renderComposerInput(start + insertText.length);
    schedulePersist();
  };

  // Returns true when the mention picker consumed the key.
  const handleMentionKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      mentionActiveIndex.value = Math.min(
        mentionActiveIndex.value + 1,
        Math.max(noteIndex.mentionCandidates.value.length - 1, 0),
      );
      return true;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      mentionActiveIndex.value = Math.max(mentionActiveIndex.value - 1, 0);
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      mentionOpen.value = false;
      return true;
    }
    if (event.key === 'Enter') {
      const candidate = noteIndex.mentionCandidates.value[mentionActiveIndex.value];
      if (candidate) {
        event.preventDefault();
        void pickMentionCandidate(candidate);
        return true;
      }
    }
    return false;
  };

  const onKeydown = (event: KeyboardEvent) => {
    // keyCode 229 covers IMEs (e.g. Safari/WebKit) that report the confirming Enter after compositionend.
    if (event.isComposing || event.keyCode === 229) return;
    if (mentionOpen.value && handleMentionKey(event)) return;

    if ((event.key === 'Backspace' || event.key === 'Delete') && !event.shiftKey) {
      const removed = removeMentionAroundCursor(
        event.key === 'Backspace' ? 'backward' : 'forward',
      );
      if (removed) {
        event.preventDefault();
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const onPaste = (event: ClipboardEvent) => {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';
    insertComposerText(text);
  };

  return {
    input,
    inputEl,
    mentionOpen,
    mentionActiveIndex,
    mentionCandidates: noteIndex.mentionCandidates,
    setComposerInput,
    focusComposer,
    triggerMention,
    pickMentionCandidate,
    onInput,
    onKeydown,
    onPaste,
  };
};

export type ChatComposerController = ReturnType<typeof useChatComposer>;
