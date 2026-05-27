import { Notice } from 'obsidian';

import {
  type AssistantActionKind,
  type AssistantActionPlan,
  buildAssistantActionPlan,
  buildMultiNoteAssistantActionPlan,
} from '../assistantActions';
import { resolveLanguageSetting } from '../i18n';
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
  if (mode === 'multi') {
    if (!multiNotes.length) {
      new Notice('请先选择要处理的笔记');
      return null;
    }
    return buildMultiNoteAssistantActionPlan({ kind, notes: multiNotes });
  }

  const activeFile = plugin.app.workspace.getActiveFile();
  const currentNote = activeFile && (activeFile as any).extension === 'md'
    ? await readObsidianFile(plugin.app, activeFile as any)
    : null;
  const selectedText = mode === 'selection' ? plugin.getActiveEditorSelection() : '';
  if (mode === 'selection' && !selectedText.trim()) {
    new Notice('当前编辑器没有选中文本');
    return null;
  }
  return buildAssistantActionPlan({ kind, currentNote, selectedText });
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
    title: result.title || `${plan.sourceTitle} 总结`,
    markdown: result.markdown || result.summary || '',
    tags: [],
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
