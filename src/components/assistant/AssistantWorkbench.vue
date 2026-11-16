<script setup lang="ts">
  import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    AcademicCapIcon,
    ArrowPathIcon,
    BookmarkSquareIcon,
    ChatBubbleOvalLeftEllipsisIcon,
    CheckCircleIcon,
    CheckIcon,
    CircleStackIcon,
    DocumentTextIcon,
    FlagIcon,
    InformationCircleIcon,
    LightBulbIcon,
    LinkIcon,
    MagnifyingGlassIcon,
    PaperAirplaneIcon,
    PlusIcon,
    QuestionMarkCircleIcon,
    ScaleIcon,
    ShareIcon,
    ShieldCheckIcon,
    SparklesIcon,
  } from '@heroicons/vue/24/outline';
  import {MapPinIcon} from '@heroicons/vue/24/solid';
  import {type Editor, Notice, type TFile} from 'obsidian';

  import {useActiveNote} from '../../composables/useActiveNote';
  import {useFlashState} from '../../composables/useFlashState';
  import {usePlugin} from '../../composables/usePlugin';
  import {useTaskHistory} from '../../composables/useTaskHistory';
  import {FEATURES} from '../../features';
  import {hasFeature} from '../../services/capabilities';
  import {filterTasksForPath} from '../../services/currentNoteWorkspace';
  import {
    openAskTab,
    openChatWithMessage,
    openHistorySelection,
    openPanelTab,
    openTopicsOverview,
    panelState,
  } from '../../services/panelStore';
  import {collectNoteTags, rankRelatedNotes, type RelatedNote} from '../../services/relatedNotes';
  import type {TaskHistoryEntry, TaskHistoryType} from '../../services/taskHistory';
  import {isPathIgnored, isPrivateNote} from '../../sync/syncRules';
  import WmTooltip from '../WmTooltip.vue';

  import WorkbenchRemoteRelated from './WorkbenchRemoteRelated.vue';

  const emit = defineEmits<{
    openHistory: [type: TaskHistoryType];
  }>();

  const REFRESH_DELAY_MS = 300;
  const EDIT_REFRESH_DELAY_MS = 2000;
  const CANDIDATE_TTL_MS = 60 * 1000;

  type RelatedCandidate = Parameters<typeof rankRelatedNotes>[0]['candidates'][number];

  const plugin = usePlugin();
  const {t, locale} = useI18n();
  const {activeFile, leafFile, revision, pinned, togglePin} = useActiveNote();
  const {tasks} = useTaskHistory();

  const {flash, isFlashing} = useFlashState();
  const charCount = ref<number | null>(null);
  const cardCount = ref<number | null>(null);
  const related = shallowRef<RelatedNote[]>([]);
  // Path the related list was computed for; a mismatch means the list is still loading.
  const relatedPath = ref('');
  const draft = ref('');
  const composerEl = ref<HTMLTextAreaElement | null>(null);
  const cardCountCache = new Map<string, number>();
  let refreshTimer = 0;
  let dirty = false;

  const visible = computed(
    () => panelState.overlay === null && panelState.tab === 'note' && panelState.noteView === 'workbench',
  );

  const activePath = computed(() => activeFile.value?.path || '');
  const unsupportedFile = computed(() => {
    if (pinned.value) return null;
    const file = leafFile.value;
    if (!file || file.extension.toLowerCase() === 'md') return null;
    return file;
  });
  const noteBlocked = computed(() => Boolean(activeFile.value && plugin.isFileExcluded(activeFile.value)));
  const privateReason = computed(() => {
    const file = activeFile.value;
    if (!file) return '';
    if (isPathIgnored(file.path, plugin.settings.ignorePatterns)) {
      const folder = file.parent?.path && file.parent.path !== '/' ? file.parent.path : file.path;
      return t('workbench.privatePath', {path: folder});
    }
    if (plugin.settings.syncRespectPrivate && isPrivateNote(plugin.app.metadataCache.getFileCache(file)?.frontmatter)) {
      return t('workbench.privateFlag');
    }
    return t('workbench.privateDesc');
  });
  const folderPath = computed(() => activeFile.value?.parent?.path || '');
  const modifiedText = computed(() => {
    const mtime = activeFile.value?.stat.mtime;
    if (!mtime) return '';
    return new Date(mtime).toLocaleString(locale.value === 'en_US' ? 'en-US' : 'zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  });
  const numberLocale = computed(() => (locale.value === 'en_US' ? 'en-US' : 'zh-CN'));
  const charCountText = computed(() =>
    charCount.value === null ? '' : t('workbench.wordCount', {count: charCount.value.toLocaleString(numberLocale.value)}),
  );
  const noteMeta = computed(() =>
    [folderPath.value && folderPath.value !== '/' ? folderPath.value : '', charCountText.value,
      modifiedText.value ? t('workbench.modifiedAt', {time: modifiedText.value}) : '']
      .filter(Boolean)
      .join(' · '),
  );
  const relatedLoading = computed(() => Boolean(activePath.value) && relatedPath.value !== activePath.value);
  const noteOutputs = computed(() => filterTasksForPath(tasks.value, activePath.value).slice(0, 4));
  const outputTooltip = (task: TaskHistoryEntry) =>
    task.description ? `${task.title}\n${task.description}` : task.title;

  const RECENT_LIMIT = 5;
  const recentNotes = computed(() => {
    if (activeFile.value) return [];
    return plugin.app.workspace
      .getLastOpenFiles()
      .filter(path => path.endsWith('.md') && plugin.app.vault.getAbstractFileByPath(path))
      .slice(0, RECENT_LIMIT)
      .map(path => ({path, title: path.split('/').pop()!.replace(/\.md$/, '')}));
  });

  type ActionKey = 'summary' | 'outline' | 'insights' | 'cards' | 'quiz' | 'flag' | 'links' | 'compare';
  const actionGroups = computed(() => [
    {
      title: t('workbench.groupUnderstand'),
      tone: '',
      cols: 3,
      items: [
        {key: 'summary' as ActionKey, label: t('workbench.summary'), icon: DocumentTextIcon},
        {key: 'outline' as ActionKey, label: t('workbench.mindMap'), icon: ShareIcon},
        {key: 'insights' as ActionKey, label: t('workbench.insights'), icon: LightBulbIcon},
      ],
    },
    {
      title: t('workbench.groupMemory'),
      tone: 'is-secondary',
      cols: 3,
      items: [
        {key: 'cards' as ActionKey, label: t('workbench.cards'), icon: BookmarkSquareIcon},
        {key: 'quiz' as ActionKey, label: t('workbench.quiz'), icon: QuestionMarkCircleIcon},
        {key: 'flag' as ActionKey, label: t('workbench.flagHard'), icon: FlagIcon},
      ],
    },
    {
      title: t('workbench.groupConnect'),
      tone: 'is-info',
      cols: 2,
      items: [
        {key: 'links' as ActionKey, label: t('workbench.links'), icon: LinkIcon},
        {key: 'compare' as ActionKey, label: t('workbench.compare'), icon: ScaleIcon},
      ],
    },
  ]);

  // Sync + topic chips on the note card (prototype N1 status row).
  const noteSync = computed(() => {
    const file = activeFile.value;
    if (!file) return null;
    const rules = plugin.syncEngine.rulesFor(file);
    const record = plugin.syncEngine.index.get(file.path);
    const nameById = new Map<number, string>();
    for (const rule of plugin.settings.syncRules) {
      rule.knowledgeBaseIds.forEach((id, index) => {
        if (id > 0 && rule.knowledgeBaseNames[index]) nameById.set(id, rule.knowledgeBaseNames[index]);
      });
    }
    const topicNames = [
      ...new Set([
        ...rules.flatMap(rule => rule.knowledgeBaseNames.filter(Boolean)),
        ...(record?.topicIds || []).map(id => nameById.get(id) || '').filter(Boolean),
      ]),
    ];
    const pending = plugin.syncEngine.state.pending.some(item => item.path === file.path);
    const conflict = plugin.syncEngine.state.conflicts.some(item => item.path === file.path);
    if (conflict) return {status: 'conflict' as const, topics: topicNames};
    if (pending) return {status: 'pending' as const, topics: topicNames};
    if (record) return {status: 'synced' as const, topics: topicNames};
    if (rules.length) return {status: 'ready' as const, topics: topicNames};
    return {status: 'none' as const, topics: topicNames};
  });

  const mention = () => `@${activePath.value} `;

  const runAction = (key: ActionKey) => {
    const file = activeFile.value;
    if (!file) return;
    if (key === 'summary' || key === 'cards') {
      void plugin.runAssistantAction(key, '', file);
      return;
    }
    if (key === 'insights') {
      void plugin.runAssistantAction('summary', '', file, 'insights');
      return;
    }
    // The client generates a real quiz when it can; older clients fall back to a chat prompt.
    if (key === 'quiz' && hasFeature(FEATURES.quiz)) {
      void plugin.createQuiz(file);
      return;
    }
    openChatWithMessage(`${mention()}${t(`workbench.prompts.${key}`)}`, true, true);
  };

  const sendDraft = () => {
    const text = draft.value.trim();
    if (!activeFile.value) return;
    if (!text) {
      openAskTab();
      return;
    }
    openChatWithMessage(`${mention()}${text}`, true, false);
    draft.value = '';
  };

  const onComposerKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    sendDraft();
  };

  // Clicking the composer padding or chips focuses the textarea, like a regular input box.
  const focusComposer = (event: MouseEvent) => {
    if ((event.target as HTMLElement | null)?.closest('button, a, textarea')) return;
    composerEl.value?.focus();
  };

  const findEditorFor = (path: string): Editor | null => {
    const active = plugin.app.workspace.activeEditor;
    if (active?.file?.path === path && active.editor) return active.editor;
    for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view as unknown as {file?: TFile | null; editor?: Editor};
      if (view.file?.path === path && view.editor) return view.editor;
    }
    return null;
  };

  const insertLink = (note: RelatedNote) => {
    const source = activeFile.value;
    const target = plugin.app.vault.getAbstractFileByPath(note.path) as TFile | null;
    const editor = source ? findEditorFor(source.path) : null;
    if (!source || !target || !editor) {
      new Notice(t('workbench.noEditor'));
      return;
    }
    editor.replaceSelection(plugin.app.fileManager.generateMarkdownLink(target, source.path));
    flash(`link:${note.path}`);
  };

  const openNote = (path: string) => void plugin.app.workspace.openLinkText(path, '', false);

  const openQuickSwitcher = () => {
    (plugin.app as any).commands?.executeCommandById?.('switcher:open');
  };

  const openPrivacySettings = () => plugin.openSettings();

  const relatedReason = (note: RelatedNote) => {
    if (note.linked) return t('workbench.linked');
    if (note.sharedTag) return t('home.relatedByTag', {tag: note.sharedTag});
    return t('home.relatedByFolder');
  };

  const openOutput = (task: TaskHistoryEntry) => openHistorySelection({type: task.type, id: task.id});

  const outputIcon = (type: TaskHistoryEntry['type']) => {
    if (type === 'cards') return BookmarkSquareIcon;
    if (type === 'chat') return ChatBubbleOvalLeftEllipsisIcon;
    if (type === 'sync') return ArrowPathIcon;
    return DocumentTextIcon;
  };

  // Prefer linked + same-folder notes; only sample recent files for tag matches so large vaults stay light.
  const RELATED_RECENT_CAP = 300;
  let candidateCache: {
    builtAt: number;
    size: number;
    folderPath: string;
    linkedKey: string;
    items: RelatedCandidate[];
  } | null = null;

  const toCandidate = (note: TFile): RelatedCandidate => ({
    path: note.path,
    title: note.basename,
    folderPath: note.parent?.path || '',
    tags: collectNoteTags(plugin.app.metadataCache.getFileCache(note)),
    modifiedAt: note.stat.mtime,
  });

  const getCandidates = (file: TFile, linkedPaths: Set<string>) => {
    const {vault} = plugin.app;
    const files = vault.getMarkdownFiles();
    const folderPath = file.parent?.path || '';
    const linkedKey = [...linkedPaths].sort().join('\0');
    const cache = candidateCache;
    if (
      cache &&
      cache.size === files.length &&
      cache.folderPath === folderPath &&
      cache.linkedKey === linkedKey &&
      Date.now() - cache.builtAt < CANDIDATE_TTL_MS
    ) {
      return cache.items;
    }

    const selected = new Map<string, TFile>();
    files.forEach(note => {
      if (note.path === file.path) return;
      if (linkedPaths.has(note.path) || (note.parent?.path || '') === folderPath) {
        selected.set(note.path, note);
      }
    });
    if (selected.size < RELATED_RECENT_CAP) {
      [...files]
        .filter(note => note.path !== file.path && !selected.has(note.path))
        .sort((a, b) => b.stat.mtime - a.stat.mtime)
        .slice(0, RELATED_RECENT_CAP - selected.size)
        .forEach(note => selected.set(note.path, note));
    }

    const items = [...selected.values()].map(toCandidate);
    candidateCache = {
      builtAt: Date.now(),
      size: files.length,
      folderPath,
      linkedKey,
      items,
    };
    return items;
  };

  const computeRelated = (file: TFile) => {
    const {metadataCache} = plugin.app;
    const resolved = metadataCache.resolvedLinks || {};
    const linkedPaths = new Set(Object.keys(resolved[file.path] || {}));
    for (const [from, targets] of Object.entries(resolved)) {
      if (targets?.[file.path]) linkedPaths.add(from);
    }
    const candidates = getCandidates(file, linkedPaths);
    related.value = rankRelatedNotes({
      activePath: file.path,
      activeTags: collectNoteTags(metadataCache.getFileCache(file)),
      linkedPaths,
      candidates,
    });
    relatedPath.value = file.path;
  };

  // Cached per path so edits do not hit the API; the cache is dropped when new outputs appear.
  const loadCardCount = async (path: string) => {
    if (cardCountCache.has(path)) {
      cardCount.value = cardCountCache.get(path) ?? null;
      return;
    }
    if (!panelState.connected) return;
    try {
      const cards = await plugin.api.listCardsBySource(path, 200);
      cardCountCache.set(path, cards?.length || 0);
      if (activePath.value === path) cardCount.value = cards?.length || 0;
    } catch {
      // Older desktop versions do not support the source filter; just hide the count.
    }
  };

  const refresh = async () => {
    const file = activeFile.value;
    if (!file) {
      related.value = [];
      relatedPath.value = '';
      charCount.value = null;
      cardCount.value = null;
      return;
    }
    computeRelated(file);
    void loadCardCount(file.path);
    try {
      const length = (await plugin.app.vault.cachedRead(file)).length;
      // The user may have switched notes while the file was being read.
      if (activePath.value === file.path) charCount.value = length;
    } catch {
      if (activePath.value === file.path) charCount.value = null;
    }
  };

  // Debounced so fast note switching or typing never blocks the editor; skipped while the
  // workbench is hidden and caught up once it becomes visible again.
  const scheduleRefresh = (delay = REFRESH_DELAY_MS) => {
    window.clearTimeout(refreshTimer);
    if (!visible.value) {
      dirty = true;
      return;
    }
    refreshTimer = window.setTimeout(() => {
      dirty = false;
      void refresh();
    }, delay);
  };

  watch(activePath, path => {
    cardCount.value = cardCountCache.get(path) ?? null;
    charCount.value = null;
    scheduleRefresh();
  }, {immediate: true});
  watch(revision, () => scheduleRefresh(EDIT_REFRESH_DELAY_MS));
  watch(visible, isVisible => {
    if (isVisible && dirty) scheduleRefresh(0);
  });
  watch(() => panelState.connected, connected => {
    if (connected && activePath.value) scheduleRefresh(0);
  });
  watch(() => noteOutputs.value.length, () => {
    if (!activePath.value) return;
    cardCountCache.delete(activePath.value);
    scheduleRefresh(0);
  });

  onBeforeUnmount(() => window.clearTimeout(refreshTimer));
</script>

<template>
  <div class="wm2-workbench">
    <Transition name="wm2-view" mode="out-in">
      <div v-if="unsupportedFile" key="unsupported" class="wm2-workbench-pane">
        <section class="wm2-card wm2-note-card">
          <div class="wm2-note-head">
            <span class="wm2-tile"><InformationCircleIcon class="wm-icon" /></span>
            <div class="wm2-note-title">
              <strong class="wm2-truncate" :title="unsupportedFile.path">{{ unsupportedFile.basename }}</strong>
              <small class="wm2-muted wm2-truncate">{{ unsupportedFile.extension.toUpperCase() }}</small>
            </div>
          </div>
        </section>
        <div class="wm2-empty is-compact">
          <InformationCircleIcon class="wm2-empty-icon" />
          <strong>{{ t('workbench.unsupportedTitle') }}</strong>
          <p>{{ t('workbench.unsupportedDesc') }}</p>
          <button class="wm2-btn is-sm" type="button" @click="openQuickSwitcher">
            <MagnifyingGlassIcon class="wm-icon" />
            {{ t('workbench.findNote') }}
          </button>
        </div>
      </div>

      <div v-else-if="!activeFile" key="empty" class="wm2-workbench-pane">
      <div class="wm2-empty">
        <DocumentTextIcon class="wm2-empty-icon" />
        <strong>{{ t('workbench.noNoteTitle') }}</strong>
        <p class="wm2-muted">{{ t('workbench.noNote') }}</p>
        <button class="wm2-btn is-sm is-primary" type="button" @click="openQuickSwitcher">
          <MagnifyingGlassIcon class="wm-icon" />
          {{ t('workbench.findNote') }}
        </button>
      </div>
      <section v-if="recentNotes.length" class="wm2-section">
        <h4 class="wm2-section-title">{{ t('workbench.recentNotes') }}</h4>
        <ul class="wm2-list">
          <li v-for="note in recentNotes" :key="note.path" class="wm2-list-row is-clickable" @click.self="openNote(note.path)">
            <DocumentTextIcon class="wm-icon" @click="openNote(note.path)" />
            <button class="wm2-list-main wm2-plain-button" type="button" :title="note.path" @click="openNote(note.path)">
              <span class="wm2-truncate">{{ note.title }}</span>
            </button>
          </li>
        </ul>
      </section>
      <section v-if="panelState.dueCount > 0" class="wm2-card wm2-workbench-due">
        <AcademicCapIcon class="wm-icon" />
        <span class="wm2-truncate">{{ t('workbench.dueToday', {count: panelState.dueCount}) }}</span>
        <button class="wm2-btn is-xs" type="button" @click="openPanelTab('review')">{{ t('workbench.goReview') }}</button>
      </section>
      </div>

      <div v-else-if="noteBlocked" key="private" class="wm2-workbench-pane">
        <section class="wm2-card wm2-note-card">
          <div class="wm2-note-head">
            <span class="wm2-tile"><ShieldCheckIcon class="wm-icon" /></span>
            <div class="wm2-note-title">
              <strong class="wm2-truncate" :title="activeFile.path">{{ activeFile.basename }}</strong>
              <small class="wm2-muted wm2-truncate" :title="noteMeta">{{ noteMeta }}</small>
            </div>
          </div>
        </section>
        <div class="wm2-empty is-compact">
          <ShieldCheckIcon class="wm2-empty-icon" />
          <strong>{{ t('workbench.privateTitle') }}</strong>
          <p>{{ privateReason }}</p>
          <button class="wm2-btn is-sm" type="button" @click="openPrivacySettings">
            {{ t('workbench.privateAction') }}
          </button>
        </div>
      </div>

      <div v-else key="note" class="wm2-workbench-pane">
      <section class="wm2-card wm2-note-card">
        <div class="wm2-note-head">
          <span class="wm2-tile"><DocumentTextIcon class="wm-icon" /></span>
          <div class="wm2-note-title">
            <strong class="wm2-truncate" :title="activeFile.path">{{ activeFile.basename }}</strong>
            <small class="wm2-muted wm2-truncate wm2-tabular" :title="noteMeta">{{ noteMeta }}</small>
          </div>
          <WmTooltip :content="pinned ? t('workbench.unpin') : t('workbench.pin')" side="bottom">
            <button
              class="wm2-icon-btn is-sm"
              :class="{'is-active': pinned}"
              type="button"
              :aria-pressed="pinned"
              @click="togglePin"
            >
              <span class="wm-visually-hidden">{{
                pinned ? t('workbench.unpin') : t('workbench.pin')
              }}</span>
              <MapPinIcon class="wm-icon" />
            </button>
          </WmTooltip>
        </div>
        <div v-if="noteSync || cardCount" class="wm2-row wm2-chips wm2-note-status">
          <span
            v-if="noteSync && noteSync.status === 'synced'"
            class="wm2-chip is-success"
          >
            <CheckCircleIcon class="wm-icon" />
            {{ t('workbench.syncedToMaterials') }}
          </span>
          <span
            v-else-if="noteSync && noteSync.status === 'pending'"
            class="wm2-chip is-warning"
          >
            {{ t('workbench.syncPending') }}
          </span>
          <span
            v-else-if="noteSync && noteSync.status === 'conflict'"
            class="wm2-chip is-warning"
          >
            {{ t('workbench.syncConflict') }}
          </span>
          <span
            v-else-if="noteSync && noteSync.status === 'ready'"
            class="wm2-chip"
          >
            {{ t('workbench.syncReady') }}
          </span>
          <button
            v-for="topic in noteSync?.topics.slice(0, 2) || []"
            :key="topic"
            class="wm2-chip is-info wm2-plain-button"
            type="button"
            @click="openTopicsOverview"
          >
            <CircleStackIcon class="wm-icon" />
            {{ t('workbench.topicChip', {name: topic}) }}
          </button>
          <button
            v-if="cardCount"
            class="wm2-chip wm2-tabular wm2-plain-button"
            type="button"
            @click="openPanelTab('review')"
          >
            <AcademicCapIcon class="wm-icon" />
            {{ t('workbench.cardCount', {count: cardCount}) }}
          </button>
        </div>
      </section>

      <section v-if="!noteOutputs.length" class="wm2-card wm2-start">
        <div class="wm2-empty is-compact">
          <SparklesIcon class="wm2-empty-icon wm2-start-icon" />
          <strong>{{ t('workbench.startTitle') }}</strong>
          <p>{{ t('workbench.startDesc') }}</p>
          <div class="wm2-start-actions">
            <button class="wm2-btn is-sm is-primary" type="button" @click="runAction('summary')">
              <DocumentTextIcon class="wm-icon" />
              {{ t('workbench.summary') }}
            </button>
            <button class="wm2-btn is-sm" type="button" @click="runAction('cards')">
              <BookmarkSquareIcon class="wm-icon" />
              {{ t('workbench.cards') }}
            </button>
          </div>
        </div>
      </section>

      <section v-for="group in actionGroups" :key="group.title" class="wm2-section">
        <h4 class="wm2-section-title">{{ group.title }}</h4>
        <div class="wm2-action-grid" :class="group.cols === 2 ? 'is-two' : ''">
          <button
            v-for="item in group.items"
            :key="item.key"
            class="wm2-action"
            :class="group.tone"
            type="button"
            :title="item.label"
            @click="runAction(item.key)"
          >
            <component :is="item.icon" class="wm-icon" />
            <span>{{ item.label }}</span>
          </button>
        </div>
      </section>

      <section class="wm2-section">
        <h4 class="wm2-section-title">
          <span>{{ t('workbench.related') }}</span>
          <small>{{ t('workbench.relatedHint') }}</small>
        </h4>
        <ul v-if="relatedLoading" class="wm2-list" aria-busy="true">
          <li v-for="index in 3" :key="index" class="wm2-list-row wm2-skeleton-row">
            <span class="wm2-skeleton is-icon"></span>
            <span class="wm2-skeleton"></span>
          </li>
        </ul>
        <TransitionGroup v-else-if="related.length" tag="ul" name="wm2-item" class="wm2-list">
          <li v-for="note in related" :key="note.path" class="wm2-list-row is-clickable" @click.self="openNote(note.path)">
            <DocumentTextIcon class="wm-icon" @click="openNote(note.path)" />
            <button class="wm2-list-main wm2-plain-button" type="button" :title="note.path" @click="openNote(note.path)">
              <span class="wm2-truncate">{{ note.title }}</span>
              <small class="wm2-muted wm2-truncate">{{ relatedReason(note) }}</small>
            </button>
            <span v-if="note.linked" class="wm2-chip">{{ t('workbench.linked') }}</span>
            <button
              v-else-if="isFlashing(`link:${note.path}`)"
              class="wm2-btn is-ghost is-xs wm2-flash-done"
              type="button"
              aria-live="polite"
            >
              <CheckIcon class="wm-icon" />
              {{ t('shared.inserted') }}
            </button>
            <button v-else class="wm2-btn is-ghost is-xs is-link" type="button" @click="insertLink(note)">
              <PlusIcon class="wm-icon" />
              {{ t('workbench.insertLink') }}
            </button>
          </li>
        </TransitionGroup>
        <p v-else class="wm2-muted">{{ t('workbench.relatedEmpty') }}</p>
      </section>

      <WorkbenchRemoteRelated :file="activeFile" :visible="visible" />

      <section v-if="noteOutputs.length" class="wm2-section">
        <h4 class="wm2-section-title">
          <span>{{ t('workbench.outputs') }}</span>
          <button class="wm2-btn is-ghost is-xs" type="button" @click="emit('openHistory', 'all')">
            {{ t('workbench.allHistory') }}
          </button>
        </h4>
        <div class="wm2-row wm2-chips">
          <button
            v-for="task in noteOutputs"
            :key="`${task.type}-${task.id}`"
            class="wm2-btn is-xs wm2-workbench-output"
            type="button"
            :title="outputTooltip(task)"
            @click="openOutput(task)"
          >
            <component :is="outputIcon(task.type)" class="wm-icon" />
            <span class="wm2-truncate">{{ task.title }}</span>
          </button>
        </div>
      </section>

      <footer class="wm2-card wm2-composer" @click="focusComposer">
        <div class="wm2-composer-scope">
          <span class="wm2-chip is-success">
            <DocumentTextIcon class="wm-icon" />
            {{ t('assistantActions.currentNote') }}
          </span>
        </div>
        <textarea
          ref="composerEl"
          v-model="draft"
          rows="2"
          :aria-label="t('workbench.askPlaceholder')"
          :placeholder="t('workbench.askPlaceholder')"
          @keydown="onComposerKeydown"
        ></textarea>
        <div class="wm2-composer-footer">
          <span class="wm2-muted wm2-truncate" :title="activeFile.path">{{ activeFile.basename }}</span>
          <WmTooltip :content="t('workbench.send')">
            <button class="wm2-send" type="button" @click="sendDraft">
              <span class="wm-visually-hidden">{{ t('workbench.send') }}</span>
              <PaperAirplaneIcon class="wm-icon" />
            </button>
          </WmTooltip>
        </div>
      </footer>
      </div>
    </Transition>
  </div>
</template>
