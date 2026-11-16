import {computed, type ComputedRef, onMounted, onUnmounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {Notice, TFile} from 'obsidian';

import {usePlugin} from '../../../composables/usePlugin';
import {useVaultNotes} from '../../../composables/useVaultNotes';
import type WiseMindObsidianPlugin from '../../../main';
import {searchNoteMentions} from '../../../services/noteMentionSearch';
import {openObsidianNote} from '../../../services/noteNavigation';
import type {ObsidianSourceItem} from '../../../types';
import {isPathIgnored, readObsidianFile} from '../../../vaultScanner';

import {mentionToken, titleFromPath, tokenizeMentionText} from './mentionText';
import type {ChatSession} from './types';

// Mentions and badges come from the scanned list, so rescan (debounced) when notes are added, removed or renamed.
const VAULT_RESCAN_DELAY_MS = 1500;

export const sessionContextPaths = (session?: ChatSession) => {
  if (!session) return [];
  const paths = Array.isArray(session.contextPaths) ? session.contextPaths : [];
  const all = [session.contextPath, ...paths].filter(Boolean);
  return Array.from(new Set(all));
};

export const activeMarkdownFile = (plugin: WiseMindObsidianPlugin) => {
  const file = plugin.app.workspace.getActiveFile();
  return file?.extension === 'md' ? file : null;
};

export const useOpenNote = () => {
  const plugin = usePlugin();
  const {t} = useI18n();
  return (path: string) =>
    openObsidianNote(plugin.app, path, {
      moved: t('obsidianMessages.noteMoved'),
      openFailed: t('obsidianMessages.noteOpenFailed'),
    });
};

/** Scanned vault notes plus the lookups the chat needs: mention search, badges and send-time references. */
export const useChatNoteIndex = () => {
  const plugin = usePlugin();
  const {t} = useI18n();
  const {notes, query, refresh} = useVaultNotes();

  const noteByPath = computed(() => new Map(notes.value.map(note => [note.path, note])));
  // Longest first so a path never matches as a prefix of a longer one; cached because every render tokenizes all user messages.
  const notePathsByLength = computed(() =>
    [...noteByPath.value.keys()].sort((a, b) => b.length - a.length),
  );
  const mentionCandidates = computed(() => {
    const configured = Math.max(0, Math.floor(Number(plugin.settings.mentionNoteLimit || 0)));
    // 0 means "use the hard cap" so large vaults never scan an unbounded candidate list.
    const limit = configured > 0 ? Math.min(configured, 200) : 200;
    return searchNoteMentions(notes.value, query.value, limit, {
      title: t('mention.titleMatch'),
      alias: t('mention.aliasMatch'),
      path: t('mention.pathMatch'),
      tag: t('mention.tagMatch'),
      folder: t('mention.folderMatch'),
    });
  });

  const tokenize = (text: string) =>
    tokenizeMentionText(text, notePathsByLength.value, path => noteByPath.value.get(path)?.title);

  const referenceTitle = (path: string) => noteByPath.value.get(path)?.title || titleFromPath(path);

  const extractMentionedPaths = (message: string) =>
    notePathsByLength.value.filter(path => message.includes(mentionToken(path)));

  // Cap note bodies sent to the model so a single oversized file cannot dominate the request.
  const NOTE_CONTENT_LIMIT = 20_000;

  // The scanned note list is a snapshot from mount time, so read the file again to send its latest content.
  const buildReference = async (path: string) => {
    if (!path) return null;
    let note: ObsidianSourceItem | undefined = noteByPath.value.get(path);
    const file = plugin.app.vault.getAbstractFileByPath(path);
    const withinScanLimits = (target: TFile) =>
      target.stat.size <= plugin.settings.maxFileSizeKb * 1024 &&
      !isPathIgnored(path, plugin.settings.ignorePatterns);
    if (file instanceof TFile && file.extension === 'md' && (note || withinScanLimits(file))) {
      try {
        note = await readObsidianFile(plugin.app, file);
      } catch {
        // Fall back to the scanned snapshot.
      }
    }
    if (!note) return null;
    const content = String(note.markdown || note.plainText || '');
    return {
      title: note.title,
      path: note.path,
      content: content.length > NOTE_CONTENT_LIMIT ? content.slice(0, NOTE_CONTENT_LIMIT) : content,
    };
  };

  let vaultRescanTimer = 0;
  const vaultEventRefs: unknown[] = [];
  const scheduleVaultRescan = () => {
    window.clearTimeout(vaultRescanTimer);
    vaultRescanTimer = window.setTimeout(() => void refresh(), VAULT_RESCAN_DELAY_MS);
  };

  onMounted(() => {
    const vault = plugin.app.vault;
    vaultEventRefs.push(vault.on('create', scheduleVaultRescan));
    vaultEventRefs.push(vault.on('delete', scheduleVaultRescan));
    vaultEventRefs.push(vault.on('rename', scheduleVaultRescan));
  });

  onUnmounted(() => {
    vaultEventRefs.forEach(ref => plugin.app.vault.offref(ref));
    vaultEventRefs.splice(0);
    window.clearTimeout(vaultRescanTimer);
  });

  return {
    notes,
    query,
    refresh,
    mentionCandidates,
    tokenize,
    referenceTitle,
    extractMentionedPaths,
    buildReference,
  };
};

export type ChatNoteIndex = ReturnType<typeof useChatNoteIndex>;

/** The note scope of the active session: the pinned/current note and any extra selected notes. */
export const useChatContext = (options: {
  noteIndex: ChatNoteIndex;
  activeSession: ComputedRef<ChatSession | undefined>;
  persistSessions: () => Promise<void>;
}) => {
  const plugin = usePlugin();
  const {t} = useI18n();
  const {noteIndex, activeSession, persistSessions} = options;
  const notePickerOpen = ref(false);
  const selectedNotesOpen = ref(false);

  const activeContextPaths = computed(() => sessionContextPaths(activeSession.value));
  const selectedContextNotes = computed(() =>
    noteIndex.notes.value.filter(note => activeContextPaths.value.includes(note.path)),
  );

  const setActiveContextPath = (path: string) => {
    const session = activeSession.value;
    if (!session) return;
    session.contextPath = path;
    session.contextPaths = path ? [path] : [];
    session.updatedAt = Date.now();
    void persistSessions();
  };

  const attachActiveNoteAsContext = () => {
    const file = activeMarkdownFile(plugin);
    if (!file) {
      new Notice(t('obsidianMessages.noMarkdownNote'));
      return;
    }
    setActiveContextPath(file.path);
  };

  const setActiveContextNotes = (items: ObsidianSourceItem[]) => {
    const session = activeSession.value;
    if (!session) return;
    const paths = items.map(item => item.path);
    session.contextPaths = paths;
    session.contextPath = paths[0] || '';
    session.updatedAt = Date.now();
    notePickerOpen.value = false;
    selectedNotesOpen.value = false;
    void persistSessions();
  };

  const removeActiveContextPath = (path: string) => {
    const session = activeSession.value;
    if (!session) return;
    const paths = activeContextPaths.value.filter(item => item !== path);
    session.contextPaths = paths;
    session.contextPath = paths[0] || '';
    if (paths.length <= 1) selectedNotesOpen.value = false;
    session.updatedAt = Date.now();
    void persistSessions();
  };

  return {
    notePickerOpen,
    selectedNotesOpen,
    activeContextPaths,
    selectedContextNotes,
    setActiveContextPath,
    attachActiveNoteAsContext,
    setActiveContextNotes,
    removeActiveContextPath,
  };
};
