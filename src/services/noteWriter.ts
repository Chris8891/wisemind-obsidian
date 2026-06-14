import { Notice } from 'obsidian';

import { translate } from '../i18n';
import type WiseMindObsidianPlugin from '../main';
import { ensureFolder, nextAvailablePath } from '../obsidianWriter';
import { sanitizeFileName } from '../text';
import type { AssistantSummaryDraft } from '../types';

export const insertTextToActiveNote = async (plugin: WiseMindObsidianPlugin, text: string, success: string) => {
  const editor = (plugin.app.workspace as any).activeEditor?.editor;
  if (editor?.replaceSelection) {
    editor.replaceSelection(text);
    new Notice(success);
    return;
  }
  const file = plugin.app.workspace.getActiveFile();
  if (!file || (file as any).extension !== 'md') {
    new Notice(translate(plugin.settings.assistantDefaults.language, 'obsidianMessages.noMarkdownNote'));
    return;
  }
  const content = await plugin.app.vault.read(file as any);
  await plugin.app.vault.modify(file as any, `${content}${text}`);
  new Notice(success);
};

export const summaryMarkdownBlock = (draft: AssistantSummaryDraft, heading = 'WiseMindAI summary') =>
  `\n\n## ${heading}\n\n${draft.markdown}\n`;

export const saveSummaryAsNewNote = async (
  plugin: WiseMindObsidianPlugin,
  draft: AssistantSummaryDraft,
  options: { folderPath?: string; title?: string; markdown?: string } = {},
) => {
  const folder = (options.folderPath ?? plugin.settings.defaultObsidianRootFolder ?? 'WiseMindAI')
    .replace(/^\/+|\/+$/g, '');
  const fallbackTitle = translate(plugin.settings.assistantDefaults.language, 'obsidianMessages.summaryFallbackTitle');
  const title = options.title?.trim() || draft.title || fallbackTitle;
  const markdown = options.markdown?.trim() || draft.markdown;
  if (folder) await ensureFolder(plugin.app, folder);
  const filename = sanitizeFileName(title, fallbackTitle);
  const path = await nextAvailablePath(plugin.app, folder ? `${folder}/${filename}.md` : `${filename}.md`);
  await plugin.app.vault.create(path, `# ${title}\n\n${markdown}\n`);
  new Notice(translate(plugin.settings.assistantDefaults.language, 'obsidianMessages.summarySaved', {path}));
  return path;
};
