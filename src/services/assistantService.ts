import { Notice } from 'obsidian';

import {
  type AssistantActionKind,
  type AssistantActionPlan,
  buildAssistantActionPlan,
  buildMultiNoteAssistantActionPlan,
} from '../assistantActions';
import { resolveLanguageSetting, translate } from '../i18n';
import type WiseMindObsidianPlugin from '../main';
import type { AssistantCardDraft, AssistantSummaryDraft, ObsidianSourceItem } from '../types';
import { readObsidianFile } from '../vaultScanner';

export type SourceMode = 'current' | 'selection' | 'multi';

export const createAssistantPlan = async (
  plugin: WiseMindObsidianPlugin,
  kind: AssistantActionKind,
  mode: SourceMode,
  multiNotes: ObsidianSourceItem[],
): Promise<AssistantActionPlan | null> => {
  const languageSetting = plugin.settings.assistantDefaults.language;
  const actionLabels = {
    currentNote: translate(languageSetting, 'assistantActions.currentNote'),
    selectionExcerpt: (title: string) => translate(languageSetting, 'assistantActions.selectionExcerpt', {title}),
    noContent: translate(languageSetting, 'assistantActions.noContent'),
    multiNoteTitle: (count: number) => translate(languageSetting, 'assistantActions.multiNoteTitle', {count}),
    sourceHeading: (index: number, path: string) =>
      translate(languageSetting, 'assistantActions.sourceHeading', {index, path}),
  };
  if (mode === 'multi') {
    if (!multiNotes.length) {
      new Notice(translate(languageSetting, 'obsidianMessages.chooseNotesFirst'));
      return null;
    }
    return buildMultiNoteAssistantActionPlan({ kind, notes: multiNotes, labels: actionLabels });
  }

  const activeFile = plugin.app.workspace.getActiveFile();
  const currentNote = activeFile && (activeFile as any).extension === 'md'
    ? await readObsidianFile(plugin.app, activeFile as any)
    : null;
  const selectedText = mode === 'selection' ? plugin.getActiveEditorSelection() : '';
  if (mode === 'selection' && !selectedText.trim()) {
    new Notice(translate(languageSetting, 'obsidianMessages.noSelection'));
    return null;
  }
  return buildAssistantActionPlan({ kind, currentNote, selectedText, labels: actionLabels });
};

export const summarize = async (
  plugin: WiseMindObsidianPlugin,
  plan: AssistantActionPlan,
  promptKey?: string,
  signal?: AbortSignal,
): Promise<AssistantSummaryDraft> => {
  const defaults = plugin.settings.assistantDefaults;
  const language = resolveLanguageSetting(defaults.language);
  const result: any = await plugin.api.summarizeContent({
    title: plan.sourceTitle,
    content: plan.content,
    sourcePath: plan.sourcePath,
    sourceKind: plan.sourceKind,
    sourcePaths: plan.sourcePaths,
    language,
    style: defaults.summaryStyle,
    promptKey,
  }, { signal });

  return {
    title: result.title || translate(defaults.language, 'summary.generatedTitle', {title: plan.sourceTitle}),
    markdown: result.markdown || result.summary || '',
    tags: [],
    sourceTitle: plan.sourceTitle,
    sourcePath: plan.sourcePath,
    sourceKind: plan.sourceKind,
    sourcePaths: plan.sourcePaths,
  };
};

export const summarizeStream = async (
  plugin: WiseMindObsidianPlugin,
  plan: AssistantActionPlan,
  promptKey?: string,
  callbacks: {
    onDelta?: (markdown: string) => void;
  } = {},
  signal?: AbortSignal,
): Promise<AssistantSummaryDraft> => {
  const defaults = plugin.settings.assistantDefaults;
  const language = resolveLanguageSetting(defaults.language);
  let markdown = '';
  const result: any = await plugin.api.summarizeContentStream(
    {
      title: plan.sourceTitle,
      content: plan.content,
      sourcePath: plan.sourcePath,
      sourceKind: plan.sourceKind,
      sourcePaths: plan.sourcePaths,
      language,
      style: defaults.summaryStyle,
      promptKey,
    },
    {
      onDelta: text => {
        markdown += text;
        callbacks.onDelta?.(markdown);
      },
    },
    {signal},
  );

  return {
    title: result.title || translate(defaults.language, 'summary.generatedTitle', {title: plan.sourceTitle}),
    markdown: result.markdown || markdown || result.summary || '',
    tags: Array.isArray(result.tags) ? result.tags : [],
    sourceTitle: plan.sourceTitle,
    sourcePath: plan.sourcePath,
    sourceKind: plan.sourceKind,
    sourcePaths: plan.sourcePaths,
  };
};

export const generateCards = async (
  plugin: WiseMindObsidianPlugin,
  plan: AssistantActionPlan,
  signal?: AbortSignal,
): Promise<AssistantCardDraft[]> => {
  const defaults = plugin.settings.assistantDefaults;
  const language = resolveLanguageSetting(defaults.language);
  const result: any = await plugin.api.generateCards({
    title: plan.sourceTitle,
    content: plan.content,
    sourcePath: plan.sourcePath,
    sourceKind: plan.sourceKind,
    sourcePaths: plan.sourcePaths,
    language,
    count: defaults.cardCount,
    difficulty: defaults.cardDifficulty,
    structure: defaults.cardStructure,
  }, { signal });

  const cards = Array.isArray(result.cards) ? result.cards : [];
  return cards.map((card: any) => ({
    content: card.content || card.markdown || card.front || '',
    tags: Array.isArray(card.tags) ? card.tags : [],
    type: card.type || card.structure || defaults.cardStructure,
  }));
};

export const generateCardsStream = async (
  plugin: WiseMindObsidianPlugin,
  plan: AssistantActionPlan,
  callbacks: {
    onDelta?: (raw: string) => void;
    onCards?: (cards: AssistantCardDraft[]) => void;
  } = {},
  signal?: AbortSignal,
): Promise<AssistantCardDraft[]> => {
  const defaults = plugin.settings.assistantDefaults;
  const language = resolveLanguageSetting(defaults.language);
  let raw = '';
  const result: any = await plugin.api.generateCardsStream(
    {
      title: plan.sourceTitle,
      content: plan.content,
      sourcePath: plan.sourcePath,
      sourceKind: plan.sourceKind,
      sourcePaths: plan.sourcePaths,
      language,
      count: defaults.cardCount,
      difficulty: defaults.cardDifficulty,
      structure: defaults.cardStructure,
    },
    {
      onDelta: text => {
        raw += text;
        callbacks.onDelta?.(raw);
        const partialCards = parsePartialGeneratedCards(raw, defaults.cardStructure);
        if (partialCards.length) {
          callbacks.onCards?.(partialCards);
        }
      },
    },
    {signal},
  );

  const cards = Array.isArray(result.cards) && result.cards.length
    ? result.cards
    : parsePartialGeneratedCards(raw, defaults.cardStructure);
  return cards.map((card: any) => ({
    content: card.content || card.markdown || card.front || '',
    tags: Array.isArray(card.tags) ? card.tags : [],
    type: card.type || card.structure || defaults.cardStructure,
  }));
};

const normalizeGeneratedCard = (
  item: any,
  fallbackType: AssistantCardDraft['type'],
): AssistantCardDraft => ({
  content: String(item?.content || item?.markdown || item?.front || item?.text || '').trim(),
  tags: Array.isArray(item?.tags || item?.tag)
    ? (item.tags || item.tag).map((tag: unknown) => String(tag).trim()).filter(Boolean)
    : [],
  type: item?.type || item?.structure || fallbackType,
});

export const parsePartialGeneratedCards = (
  raw: string,
  fallbackType: AssistantCardDraft['type'] = 'concept',
) => {
  const source = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '');
  const completeCards = parseCompleteGeneratedCards(source, fallbackType);
  if (completeCards.length) return completeCards;

  const cards: AssistantCardDraft[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char !== '}') {
      continue;
    }
    depth -= 1;
    if (depth === 0 && start >= 0) {
      try {
        const card = normalizeGeneratedCard(JSON.parse(source.slice(start, index + 1)), fallbackType);
        if (card.content) {
          cards.push(card);
        }
      } catch {
        // Ignore incomplete objects while the stream is still arriving.
      }
      start = -1;
    }
  }

  return cards;
};

const parseCompleteGeneratedCards = (
  source: string,
  fallbackType: AssistantCardDraft['type'],
): AssistantCardDraft[] => {
  try {
    const data = JSON.parse(source);
    const items: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.cards) ? data.cards : [];
    return items
      .map((item: unknown) => normalizeGeneratedCard(item, fallbackType))
      .filter(card => card.content);
  } catch {
    return [];
  }
};
