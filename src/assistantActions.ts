import type { ObsidianSourceItem } from './types';

export type AssistantActionKind = 'summary' | 'cards';
export type AssistantSourceKind = 'current-note' | 'selection' | 'multi-note';

export type AssistantActionLabels = {
  currentNote: string;
  selectionExcerpt: (title: string) => string;
  noContent: string;
  multiNoteTitle: (count: number) => string;
  sourceHeading: (index: number, path: string) => string;
};

const defaultLabels: AssistantActionLabels = {
  currentNote: 'Current note',
  selectionExcerpt: title => `${title} excerpt`,
  noContent: 'No processable note content',
  multiNoteTitle: count => `${count} notes`,
  sourceHeading: (index, path) => `Source ${index}: ${path}`,
};

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
  labels?: AssistantActionLabels;
}): AssistantActionPlan => {
  const selectedText = options.selectedText?.trim() || '';
  const labels = options.labels || defaultLabels;

  if (selectedText) {
    return {
      kind: options.kind,
      sourceKind: 'selection',
      sourceTitle: labels.selectionExcerpt(options.currentNote?.title || labels.currentNote),
      sourcePath: options.currentNote?.path || '',
      content: selectedText,
    };
  }

  if (!options.currentNote?.plainText?.trim()) {
    throw new Error(labels.noContent);
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
  labels?: AssistantActionLabels;
}): AssistantActionPlan => {
  const notes = options.notes.filter(note => note.plainText?.trim() || note.markdown?.trim());
  const labels = options.labels || defaultLabels;
  if (!notes.length) {
    throw new Error(labels.noContent);
  }

  return {
    kind: options.kind,
    sourceKind: 'multi-note',
    sourceTitle: labels.multiNoteTitle(notes.length),
    sourcePath: notes.map(note => note.path).join(', '),
    sourcePaths: notes.map(note => note.path),
    content: notes
      .map((note, index) => [
        `# ${labels.sourceHeading(index + 1, note.path)}`,
        '',
        note.markdown || note.plainText,
      ].join('\n'))
      .join('\n\n---\n\n'),
  };
};
