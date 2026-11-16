import {onMounted, onUnmounted, ref} from 'vue';
import {TFile} from 'obsidian';

import {usePlugin} from '../../../composables/usePlugin';

/** Tracks the active editor file (no pinning) so recordings can target the open Markdown note. */
export function useActiveMarkdownFile() {
  const plugin = usePlugin();
  const workspaceEventRefs: unknown[] = [];
  const vaultEventRefs: unknown[] = [];

  const activeFile = ref(plugin.app.workspace.getActiveFile());
  const activeMarkdownPath = ref(
    activeFile.value instanceof TFile && activeFile.value.extension === 'md'
      ? activeFile.value.path
      : '',
  );

  const refreshActiveFile = (candidate = plugin.app.workspace.getActiveFile()) => {
    activeFile.value = candidate;
    const markdownFile =
      candidate instanceof TFile && candidate.extension === 'md' ? candidate : null;
    activeMarkdownPath.value = markdownFile?.path || '';
    return markdownFile;
  };

  onMounted(() => {
    refreshActiveFile();
    const workspace = plugin.app.workspace as any;
    const vault = plugin.app.vault as any;
    const fileOpenRef = workspace.on?.('file-open', (file: TFile | null) => {
      refreshActiveFile(file || plugin.app.workspace.getActiveFile());
    });
    if (fileOpenRef) workspaceEventRefs.push(fileOpenRef);
    const leafChangeRef = workspace.on?.('active-leaf-change', () => refreshActiveFile());
    if (leafChangeRef) workspaceEventRefs.push(leafChangeRef);
    const renameRef = vault.on?.('rename', (file: TFile, oldPath: string) => {
      if (oldPath === activeMarkdownPath.value || file === activeFile.value) {
        refreshActiveFile(file);
      }
    });
    if (renameRef) vaultEventRefs.push(renameRef);
  });

  onUnmounted(() => {
    const workspace = plugin.app.workspace as any;
    const vault = plugin.app.vault as any;
    if (typeof workspace.offref === 'function') {
      workspaceEventRefs.forEach(eventRef => workspace.offref(eventRef));
    }
    if (typeof vault.offref === 'function') {
      vaultEventRefs.forEach(eventRef => vault.offref(eventRef));
    }
    workspaceEventRefs.splice(0);
    vaultEventRefs.splice(0);
  });

  return {activeFile, activeMarkdownPath, refreshActiveFile};
}

export type ActiveMarkdownFile = ReturnType<typeof useActiveMarkdownFile>;
