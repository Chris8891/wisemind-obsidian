import { Notice } from 'obsidian';

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
    new Notice('当前没有打开的 Markdown 笔记');
    return;
  }
  const content = await plugin.app.vault.read(file as any);
  await plugin.app.vault.modify(file as any, `${content}${text}`);
  new Notice(success);
};

export const summaryMarkdownBlock = (draft: AssistantSummaryDraft) => `\n\n## WiseMindAI 总结\n\n${draft.markdown}\n`;

export const saveSummaryAsNewNote = async (
  plugin: WiseMindObsidianPlugin,
  draft: AssistantSummaryDraft,
  options: { folderPath?: string; title?: string; markdown?: string } = {},
) => {
  const folder = (options.folderPath ?? plugin.settings.defaultObsidianRootFolder ?? 'WiseMindAI')
    .replace(/^\/+|\/+$/g, '');
  const title = options.title?.trim() || draft.title || 'WiseMindAI 总结';
  const markdown = options.markdown?.trim() || draft.markdown;
  if (folder) await ensureFolder(plugin.app, folder);
  const filename = sanitizeFileName(title, 'WiseMindAI 总结');
  const path = await nextAvailablePath(plugin.app, folder ? `${folder}/${filename}.md` : `${filename}.md`);
  await plugin.app.vault.create(path, `# ${title}\n\n${markdown}\n`);
  new Notice(`总结已保存为新笔记：${path}`);
  return path;
};
