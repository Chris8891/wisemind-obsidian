import type { App, TFile } from 'obsidian';
import { Notice } from 'obsidian';

export const openObsidianNote = async (app: App, path: string) => {
  if (!path) return false;
  const file = app.vault.getAbstractFileByPath(path) as TFile | null;
  if (!file || (file as any).extension !== 'md') {
    new Notice('笔记已删除或被移动位置');
    return false;
  }

  const workspace = app.workspace as any;
  const leaf = workspace.getLeaf?.(false) || workspace.activeLeaf;
  if (!leaf?.openFile) {
    new Notice('无法打开这篇笔记');
    return false;
  }

  await leaf.openFile(file, {active: true});
  return true;
};
