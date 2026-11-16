import {TFolder} from 'obsidian';

import type WiseMindObsidianPlugin from '../main';
import {panelState} from '../services/panelStore';

const FLUSH_DELAY_MS = 1500;
const MAX_PENDING = 500;

type PendingRename = {from: string; to: string; prefix: boolean};

/**
 * Keeps card source paths in WiseMindAI in sync with note renames and moves.
 * Renames are batched because moving a folder fires one event per file, and they stay queued
 * while WiseMindAI is offline so the plugin can catch up after reconnecting.
 */
export const registerRenameTracker = (plugin: WiseMindObsidianPlugin) => {
  const pending: PendingRename[] = [];
  let timer = 0;
  let flushing = false;

  const flush = async () => {
    if (flushing || !pending.length || !panelState.connected) return;
    flushing = true;
    try {
      while (pending.length && panelState.connected) {
        const item = pending[0];
        try {
          await plugin.api.renameCardSourcePath(item.from, item.to, item.prefix);
        } catch {
          // Keep the queue if the app went away; reconnecting flushes it again.
          if (!(await plugin.testConnection())) break;
          // Older desktop versions do not have this endpoint; dropping the item avoids retry loops.
        }
        if (pending[0] === item) pending.shift();
      }
    } finally {
      flushing = false;
    }
  };

  const enqueue = (item: PendingRename) => {
    // A chain like a -> b -> c collapses into a -> c.
    const chained = pending.find(entry => entry.prefix === item.prefix && entry.to === item.from);
    if (chained) chained.to = item.to;
    else pending.push(item);
    if (pending.length > MAX_PENDING) pending.splice(0, pending.length - MAX_PENDING);
  };

  plugin.registerEvent(
    plugin.app.vault.on('rename', (file, oldPath) => {
      if (!plugin.settings.review.trackRename) return;
      const folder = file instanceof TFolder;
      const isNote = (path: string) => path.toLowerCase().endsWith('.md');
      if (!folder && !isNote(file.path) && !isNote(oldPath)) return;
      if (folder) {
        // Child files also fire rename events; the single prefix update covers all of them.
        for (let i = pending.length - 1; i >= 0; i -= 1) {
          if (!pending[i].prefix && pending[i].from.startsWith(`${oldPath}/`)) pending.splice(i, 1);
        }
        enqueue({from: `${oldPath}/`, to: `${file.path}/`, prefix: true});
      } else if (!pending.some(item => item.prefix && oldPath.startsWith(item.from))) {
        enqueue({from: oldPath, to: file.path, prefix: false});
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void flush(), FLUSH_DELAY_MS);
    }),
  );
  plugin.register(() => {
    window.clearTimeout(timer);
    void flush();
  });

  return {flush};
};
