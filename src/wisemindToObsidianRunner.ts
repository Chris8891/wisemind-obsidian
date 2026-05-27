import type { App } from 'obsidian';

import { emptyResult, push } from './importRunner';
import { writeWiseMindItemToObsidian } from './obsidianWriter';
import type { DuplicatePolicy, SyncRunResult, WiseMindSourceItem } from './types';

export type WiseMindToObsidianOptions = {
  app: App;
  items: WiseMindSourceItem[];
  rootFolder: string;
  rootFolders?: string[];
  includeFolderStructure?: boolean;
  duplicatePolicy: DuplicatePolicy;
  chunkSize: number;
  signal?: AbortSignal;
  onProgress?: (result: SyncRunResult) => void;
};

export const runWiseMindToObsidianImport = async (options: WiseMindToObsidianOptions): Promise<SyncRunResult> => {
  const result = emptyResult();
  const rootFolders = options.rootFolders?.length ? options.rootFolders : [options.rootFolder];
  for (let index = 0; index < options.items.length; index += options.chunkSize || 10) {
    if (options.signal?.aborted) break;
    const chunk = options.items.slice(index, index + (options.chunkSize || 10));
    for (const item of chunk) {
      if (options.signal?.aborted) break;
      try {
        for (const rootFolder of rootFolders) {
          const itemResult = await writeWiseMindItemToObsidian(
            options.app,
            item,
            rootFolder,
            options.duplicatePolicy,
            options.includeFolderStructure ?? true,
          );
          push(result, itemResult.title, itemResult.source, itemResult.status, itemResult.message, itemResult.target);
        }
      } catch (error: any) {
        push(result, item.title, `${item.sourceType}:${item.id}`, 'failed', error?.message || '同步失败', '失败');
      }
      options.onProgress?.(result);
    }
  }
  return result;
};
