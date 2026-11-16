import type {TAbstractFile, TFile} from 'obsidian';

import type WiseMindObsidianPlugin from '../main';

const AUTO_SYNC_DELAY_MS = 4000;

const isMarkdown = (file: TAbstractFile): file is TFile => (file as TFile).extension === 'md';

/**
 * Collects vault changes for notes covered by "auto" rules and syncs them in one batch once
 * editing pauses. Registered after layout ready, so the initial vault load fires nothing.
 */
export const registerSyncWatcher = (plugin: WiseMindObsidianPlugin) => {
  const dirty = new Set<string>();
  let timer = 0;

  const flush = () => {
    timer = 0;
    if (!dirty.size) return;
    const paths = [...dirty];
    dirty.clear();
    if (!plugin.connected) {
      plugin.syncEngine.queue(paths);
      return;
    }
    void plugin.syncEngine.sync({paths, silent: true});
  };

  const touch = (file: TAbstractFile) => {
    if (!plugin.settings.syncAuto || !plugin.settings.syncRules.length || !isMarkdown(file)) return;
    if (!plugin.syncEngine.rulesFor(file, 'auto').length) return;
    dirty.add(file.path);
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, AUTO_SYNC_DELAY_MS);
  };

  const {vault} = plugin.app;
  plugin.registerEvent(vault.on('modify', touch));
  plugin.registerEvent(vault.on('create', touch));
  plugin.registerEvent(
    vault.on('rename', (file, oldPath) => {
      if (!isMarkdown(file)) return;
      dirty.delete(oldPath);
      void plugin.syncEngine.index.load().then(() => plugin.syncEngine.index.rename(oldPath, file.path));
      touch(file);
    }),
  );
  plugin.registerEvent(
    vault.on('delete', file => {
      if (!isMarkdown(file)) return;
      dirty.delete(file.path);
      // One-way sync never deletes the copy in WiseMindAI; only the local record goes away.
      void plugin.syncEngine.index.load().then(() => plugin.syncEngine.index.delete(file.path));
    }),
  );
  plugin.register(() => window.clearTimeout(timer));
};
