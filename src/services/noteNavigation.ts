import type { App, TFile } from 'obsidian';
import { Notice } from 'obsidian';

export const openObsidianNote = async (
  app: App,
  path: string,
  messages: {moved: string; openFailed: string} = {
    moved: 'The note was deleted or moved',
    openFailed: 'Could not open this note',
  },
) => {
  if (!path) return false;
  const file = app.vault.getAbstractFileByPath(path) as TFile | null;
  if (!file || (file as any).extension !== 'md') {
    new Notice(messages.moved);
    return false;
  }

  const workspace = app.workspace as any;
  const leaf = workspace.getLeaf?.(false) || workspace.activeLeaf;
  if (!leaf?.openFile) {
    new Notice(messages.openFailed);
    return false;
  }

  await leaf.openFile(file, {active: true});
  return true;
};
