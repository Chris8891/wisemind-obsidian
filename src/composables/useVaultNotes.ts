import { computed, ref } from 'vue';
import { Notice } from 'obsidian';

import type { ObsidianSourceItem } from '../types';
import { scanVault } from '../vaultScanner';

import { usePlugin } from './usePlugin';

export const useVaultNotes = () => {
  const plugin = usePlugin();
  const notes = ref<ObsidianSourceItem[]>([]);
  const loading = ref(false);
  const query = ref('');

  const filteredNotes = computed(() => {
    const keyword = query.value.trim().toLowerCase();
    if (!keyword) return notes.value;
    return notes.value.filter(note => `${note.title} ${note.path}`.toLowerCase().includes(keyword));
  });

  const refresh = async () => {
    loading.value = true;
    try {
      notes.value = await scanVault(plugin.app, {
        maxFileSizeKb: plugin.settings.maxFileSizeKb,
        ignorePatterns: plugin.settings.ignorePatterns,
      });
    } catch (error: any) {
      new Notice(error?.message || '读取 Obsidian 笔记失败');
    } finally {
      loading.value = false;
    }
  };

  return { notes, filteredNotes, loading, query, refresh };
};
