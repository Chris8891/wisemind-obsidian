import {computed, onMounted, onUnmounted, shallowRef, triggerRef} from 'vue';
import type {TAbstractFile, TFile} from 'obsidian';

import {panelState} from '../services/panelStore';

import {usePlugin} from './usePlugin';

const isMarkdown = (file: TFile | null | undefined): file is TFile =>
  Boolean(file && String(file.extension).toLowerCase() === 'md');

/** Follows the active editor note unless a note is pinned (until unpinned or deleted). */
export const useActiveNote = () => {
  const plugin = usePlugin();
  const activeFile = shallowRef<TFile | null>(null);
  /** Whatever file the editor is showing, including canvas, PDF, and images. */
  const leafFile = shallowRef<TFile | null>(null);
  const revision = shallowRef(0);
  const eventRefs: unknown[] = [];

  const resolvePinned = () => {
    if (!panelState.pinnedNotePath) return null;
    const file = plugin.app.vault.getAbstractFileByPath(panelState.pinnedNotePath) as TFile | null;
    if (isMarkdown(file)) return file;
    panelState.pinnedNotePath = '';
    return null;
  };

  const refresh = () => {
    leafFile.value = plugin.app.workspace.getActiveFile();
    const pinned = resolvePinned();
    if (pinned) {
      activeFile.value = pinned;
      return;
    }
    const file = plugin.app.workspace.getActiveFile();
    if (isMarkdown(file)) {
      activeFile.value = file;
    } else if (!plugin.app.workspace.getLeavesOfType('markdown').length) {
      activeFile.value = null;
    }
  };

  const onFileChanged = (file: TAbstractFile) => {
    if (file?.path === activeFile.value?.path) revision.value += 1;
  };

  // TFile objects are mutated in place on rename, so the ref has to be re-triggered by hand.
  const onRename = (file: TAbstractFile, oldPath: string) => {
    const pinnedPath = panelState.pinnedNotePath;
    if (pinnedPath === oldPath) panelState.pinnedNotePath = file.path;
    else if (pinnedPath.startsWith(`${oldPath}/`)) panelState.pinnedNotePath = file.path + pinnedPath.slice(oldPath.length);
    refresh();
    triggerRef(activeFile);
  };

  const pinned = computed(() => Boolean(panelState.pinnedNotePath));

  const togglePin = () => {
    panelState.pinnedNotePath = panelState.pinnedNotePath ? '' : activeFile.value?.path || '';
    refresh();
  };

  onMounted(() => {
    refresh();
    const workspace = plugin.app.workspace;
    const vault = plugin.app.vault;
    eventRefs.push(workspace.on('file-open', refresh));
    eventRefs.push(workspace.on('active-leaf-change', refresh));
    eventRefs.push(vault.on('modify', onFileChanged));
    eventRefs.push(vault.on('rename', onRename));
    eventRefs.push(vault.on('delete', refresh));
  });

  onUnmounted(() => {
    eventRefs.forEach(ref => {
      plugin.app.workspace.offref(ref);
      plugin.app.vault.offref(ref);
    });
    eventRefs.splice(0);
  });

  return {activeFile, leafFile, revision, pinned, togglePin, refresh};
};
