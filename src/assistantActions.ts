import type { ObsidianSourceItem } from './types';

export type AssistantActionKind = 'summary' | 'cards';
export type AssistantSourceKind = 'current-note' | 'selection' | 'multi-note';

export type AssistantActionPlan = {
  kind: AssistantActionKind;
  sourceKind: AssistantSourceKind;
  sourceTitle: string;
  sourcePath: string;
  sourcePaths?: string[];
  content: string;
};

export const buildAssistantActionPlan = (options: {
  kind: AssistantActionKind;
  currentNote?: ObsidianSourceItem | null;
  selectedText?: string;
}): AssistantActionPlan => {
  const selectedText = options.selectedText?.trim() || '';

  if (selectedText) {
    return {
      kind: options.kind,
      sourceKind: 'selection',
      sourceTitle: `${options.currentNote?.title || '当前笔记'} 摘录`,
      sourcePath: options.currentNote?.path || '',
      content: selectedText,
    };
  }

  if (!options.currentNote?.plainText?.trim()) {
    throw new Error('没有可处理的笔记内容');
  }

  return {
    kind: options.kind,
    sourceKind: 'current-note',
    sourceTitle: options.currentNote.title,
    sourcePath: options.currentNote.path,
    content: options.currentNote.markdown || options.currentNote.plainText,
  };
};

export const buildMultiNoteAssistantActionPlan = (options: {
  kind: AssistantActionKind;
  notes: ObsidianSourceItem[];
}): AssistantActionPlan => {
  const notes = options.notes.filter(note => note.plainText?.trim() || note.markdown?.trim());
  if (!notes.length) {
    throw new Error('没有可处理的笔记内容');
  }

  return {
    kind: options.kind,
    sourceKind: 'multi-note',
    sourceTitle: `${notes.length} 篇笔记`,
    sourcePath: notes.map(note => note.path).join(', '),
    sourcePaths: notes.map(note => note.path),
    content: notes
      .map((note, index) => [
        `# 来源 ${index + 1}：${note.path}`,
        '',
        note.markdown || note.plainText,
      ].join('\n'))
      .join('\n\n---\n\n'),
  };
};
