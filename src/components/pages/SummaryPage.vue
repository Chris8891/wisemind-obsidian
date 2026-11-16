<script setup lang="ts">
  import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowDownTrayIcon,
    ArrowPathIcon,
    ArrowTopRightOnSquareIcon,
    BookmarkSquareIcon,
    ChatBubbleOvalLeftEllipsisIcon,
    CheckIcon,
    ChevronDownIcon,
    CircleStackIcon,
    ClipboardDocumentIcon,
    ClockIcon,
    DocumentPlusIcon,
    DocumentTextIcon,
    ListBulletIcon,
    PencilSquareIcon,
    PlusIcon,
    SparklesIcon,
    StopIcon,
    XMarkIcon,
  } from '@heroicons/vue/24/outline';
  import {Notice, Platform} from 'obsidian';
  import {
    DialogContent,
    DialogDescription,
    DialogOverlay,
    DialogPortal,
    DialogRoot,
    DialogTitle,
    SelectContent,
    SelectItem,
    SelectItemText,
    SelectPortal,
    SelectRoot,
    SelectTrigger,
    SelectValue,
    SelectViewport,
  } from 'reka-ui';

  import type {AssistantActionPlan} from '../../assistantActions';
  import {useFlashState} from '../../composables/useFlashState';
  import {usePlugin} from '../../composables/usePlugin';
  import {useStickToBottom} from '../../composables/useStickToBottom';
  import {useWiseMindConnectionGuard} from '../../composables/useWiseMindConnectionGuard';
  import {
    createAssistantPlan,
    type SourceMode,
    summarizeStream,
  } from '../../services/assistantService';
  import {openObsidianNote} from '../../services/noteNavigation';
  import {
    insertTextToActiveNote,
    saveSummaryAsNewNote,
    summaryMarkdownBlock,
  } from '../../services/noteWriter';
  import {hasInsertTarget} from '../../services/noteWriter';
  import {panelState} from '../../services/panelStore';
  import {type PluginTaskStatus, upsertPluginTask} from '../../services/pluginTaskProgress';
  import {notifyTaskHistoryUpdated} from '../../services/taskHistory';
  import type {AssistantSummaryDraft, ObsidianSourceItem} from '../../types';
  import ResultNextSteps from '../assistant/ResultNextSteps.vue';
  import AssistantSourceNotes from '../AssistantSourceNotes.vue';
  import NotePickerDialog from '../NotePickerDialog.vue';
  import RekaSearchSelect from '../RekaSearchSelect.vue';
  import RekaSelect from '../RekaSelect.vue';
  import SourceSelector from '../SourceSelector.vue';
  import StreamingMarkdownView from '../StreamingMarkdownView.vue';
  import WiseMindConnectionDialog from '../WiseMindConnectionDialog.vue';
  import WmTooltip from '../WmTooltip.vue';

  const props = defineProps<{
    historyItemId?: string;
    historyToken?: number;
    resetToken?: number;
  }>();
  const emit = defineEmits<{
    openHistory: [];
    openChat: [message: string, autoSend?: boolean, newSession?: boolean];
    openCards: [payload: {title: string; sourcePath?: string; markdown: string}];
    openSync: [];
  }>();

  const plugin = usePlugin();
  const {t} = useI18n();
  const {connectionDialogOpen, ensureWiseMindConnected} = useWiseMindConnectionGuard();
  const sourceMode = ref<SourceMode>('current');
  const pickerOpen = ref(false);
  const selectedNotes = ref<ObsidianSourceItem[]>([]);
  const loading = ref(false);
  const error = ref('');
  const draft = ref<AssistantSummaryDraft | null>(null);
  const controller = ref<AbortController | null>(null);
  const saveDialogOpen = ref(false);
  const saveTitle = ref('');
  const saveMarkdown = ref('');
  const rootNoteFolderValue = '__root__';
  const saveFolderId = ref(rootNoteFolderValue);
  const noteFolders = ref<Array<{value: string; label: string}>>([
    {value: rootNoteFolderValue, label: t('summary.rootFolder')},
  ]);
  const savingToWiseMind = ref(false);
  const obsidianSaveDialogOpen = ref(false);
  const obsidianSaveTitle = ref('');
  const obsidianSaveMarkdown = ref('');
  const obsidianSaveFolder = ref('');
  const obsidianFolders = ref<Array<{value: string; label: string}>>([]);
  const savingToObsidian = ref(false);
  const currentSummaryHistoryId = ref('');
  const activeTaskId = ref('');
  const editingSummary = ref(false);
  const editableSummaryMarkdown = ref('');
  const streamingSummary = ref(false);
  const promptOptions = ref<Array<{key: string; name: string; order?: number; icon?: string}>>([]);
  const selectedPromptKey = ref('');
  const promptListLoading = ref(false);
  const defaultPromptOption = {
    key: 'system-summary-markdown',
    name: t('summary.defaultPromptName'),
    order: 1,
  };

  // getActiveFile() is not reactive; mirror it so the source label and generate button follow note switches.
  const activeMarkdownPath = () => {
    const file = plugin.app.workspace.getActiveFile();
    return file?.extension === 'md' ? file.path : '';
  };
  const currentNotePath = ref(activeMarkdownPath());
  const refreshCurrentNotePath = () => {
    currentNotePath.value = activeMarkdownPath();
  };
  const workspaceEventRefs: unknown[] = [];
  const sourceLabel = computed(() => {
    if (draft.value?.sourcePath || draft.value?.sourceTitle) {
      return draft.value.sourcePath || draft.value.sourceTitle || '';
    }
    if (sourceMode.value === 'selection') return t('summary.selectedText');
    if (sourceMode.value === 'multi')
      return selectedNotes.value.length
        ? t('summary.selectedNotes', {count: selectedNotes.value.length})
        : t('summary.noSelectedNotes');
    return currentNotePath.value || t('summary.noOpenNote');
  });
  const currentSourceUnavailable = computed(() => sourceMode.value === 'current' && !currentNotePath.value);
  // True while the connection check and note reading run, before `loading` takes over.
  const preparing = ref(false);
  /** Why generating is impossible right now; shown as the tooltip of the disabled button. */
  const generateBlockedReason = computed(() => {
    if (currentSourceUnavailable.value) return t('summary.noOpenNote');
    if (sourceMode.value === 'multi' && !selectedNotes.value.length) return t('summary.noSelectedNotes');
    return '';
  });
  const canGenerateSummary = computed(() => !loading.value && !preparing.value && !generateBlockedReason.value);

  const {flash, isFlashing} = useFlashState();
  const bodyEl = ref<HTMLElement | null>(null);
  const editorEl = ref<HTMLTextAreaElement | null>(null);
  const obsidianTitleInput = ref<HTMLInputElement | null>(null);
  const wiseMindTitleInput = ref<HTMLInputElement | null>(null);
  const savingEdit = ref(false);
  const inserting = ref(false);
  const showNextSteps = ref(false);
  const nextStepsVariant = ref<'inserted' | 'saved'>('inserted');

  const markNextSteps = (variant: 'inserted' | 'saved') => {
    nextStepsVariant.value = variant;
    showNextSteps.value = true;
  };
  const bodyFollow = useStickToBottom(bodyEl);
  const summaryPromptOptions = computed(() => {
    const customOptions = promptOptions.value.filter(option => option.key !== defaultPromptOption.key);
    return [defaultPromptOption, ...customOptions];
  });

  const selectedPromptName = computed(
    () => summaryPromptOptions.value.find(option => option.key === selectedPromptKey.value)?.name || '',
  );
  const draftSourceTitle = computed(() => draft.value?.sourceTitle || draft.value?.title || '');
  const sourceNotePath = computed(() => draft.value?.sourcePath || currentNotePath.value);

  type SaveDestination = 'insert' | 'newNote' | 'wiseMind';
  const saveDestination = ref<SaveDestination>('insert');
  const canInsertCurrentNote = computed(() => sourceMode.value !== 'multi');
  const destinationOptions = computed(() =>
    [
      {key: 'insert' as const, label: t('summary.destInsert'), icon: ArrowDownTrayIcon},
      {key: 'newNote' as const, label: t('summary.destNewNote'), icon: PencilSquareIcon},
      {key: 'wiseMind' as const, label: t('summary.destWiseMind'), icon: CircleStackIcon},
    ].filter(option => option.key !== 'insert' || canInsertCurrentNote.value),
  );
  const activeDestination = computed<SaveDestination>(() =>
    saveDestination.value === 'insert' && !canInsertCurrentNote.value ? 'newNote' : saveDestination.value,
  );
  const destinationHint = computed(() => {
    if (activeDestination.value === 'insert') return t('summary.destInsertHint');
    if (activeDestination.value === 'newNote') return t('summary.destNewNoteHint');
    return t('summary.destWiseMindHint');
  });
  const primaryActionLabel = computed(() => {
    if (activeDestination.value === 'insert') return t('summary.destInsert');
    if (activeDestination.value === 'newNote') return t('summary.saveNewNote');
    return t('summary.saveToWiseMind');
  });
  const primaryActionIcon = computed(
    () => destinationOptions.value.find(option => option.key === activeDestination.value)?.icon || ArrowDownTrayIcon,
  );
  const shortcutLabel = Platform.isMacOS ? '\u2318\u21b5' : 'Ctrl+\u21b5';

  const openSourceNote = () => {
    if (!sourceNotePath.value) return;
    void openObsidianNote(plugin.app, sourceNotePath.value, {
      moved: t('obsidianMessages.noteMoved'),
      openFailed: t('obsidianMessages.noteOpenFailed'),
    });
  };

  const removeSelectedNote = (path: string) => {
    selectedNotes.value = selectedNotes.value.filter(note => note.path !== path);
  };

  const loadSummaryPrompts = async () => {
    if (promptListLoading.value) return;
    promptListLoading.value = true;
    try {
      const result = await plugin.api.listAssistantPrompts('documentSummary');
      promptOptions.value = Array.isArray(result.options) ? result.options : [];
      const nextDefault = result.defaultPromptKey || defaultPromptOption.key;
      if (!selectedPromptKey.value || !summaryPromptOptions.value.some(item => item.key === selectedPromptKey.value)) {
        selectedPromptKey.value = nextDefault;
      }
    } catch {
      promptOptions.value = [];
      selectedPromptKey.value ||= defaultPromptOption.key;
    } finally {
      promptListLoading.value = false;
    }
  };

  let promptReloadTimer = 0;
  const openCreateSummaryPrompt = async () => {
    selectedPromptKey.value = summaryPromptOptions.value[0]?.key || defaultPromptOption.key;
    try {
      await plugin.api.openSource({
        type: 'setting',
        settingType: 'prompt',
        params: {
          tab: 'enable',
          enableTab: 'documentSummary',
          openCreateToken: Date.now(),
          autoEnableCreatedPrompt: false,
        },
      });
    } catch (err: any) {
      new Notice(err?.message || t('searchPage.openWiseMindFailed'));
      return;
    }
    window.clearTimeout(promptReloadTimer);
    promptReloadTimer = window.setTimeout(() => void loadSummaryPrompts(), 1200);
  };

  // Each run gets a sequence number; cancel/reset/history bump it so a stale run never touches the page state.
  let runSeq = 0;
  const invalidateRun = () => {
    runSeq += 1;
  };

  const dropEmptyDraft = () => {
    if (draft.value && !draft.value.markdown) draft.value = null;
  };

  const saveSummaryHistory = async () => {
    if (!draft.value) return;
    const historyId = `summary-${Date.now()}`;
    currentSummaryHistoryId.value = historyId;
    plugin.settings.assistantSummaryHistory.unshift({
      ...draft.value,
      title: draft.value.sourceTitle || draft.value.title,
      summaryTitle: draft.value.title,
      id: historyId,
      createdAt: Date.now(),
    });
    plugin.settings.assistantSummaryHistory = plugin.settings.assistantSummaryHistory.slice(0, 50);
    await plugin.saveSettings();
    notifyTaskHistoryUpdated();
  };

  /** `taskId` enables task-center progress and history saving; external actions run without them. */
  const runSummary = async (plan: AssistantActionPlan, taskId = '') => {
    controller.value?.abort();
    const runId = ++runSeq;
    const runController = new AbortController();
    controller.value = runController;
    const isCurrentRun = () => runId === runSeq;
    const reportTask = (status: PluginTaskStatus, title: string, message?: string) => {
      if (taskId) upsertPluginTask({id: taskId, title, status, ...(message ? {message} : {})});
    };
    activeTaskId.value = taskId;
    const insights = plan.preset === 'insights';
    reportTask('running', t(insights ? 'summary.insightsGenerating' : 'summary.taskGenerating'));
    bodyFollow.reset();
    showNextSteps.value = false;
    loading.value = true;
    streamingSummary.value = true;
    error.value = '';
    editingSummary.value = false;
    editableSummaryMarkdown.value = '';
    currentSummaryHistoryId.value = '';
    const insightsTitle = (sourceTitle: string) =>
      sourceTitle ? t('summary.insightsTitle', {title: sourceTitle}) : t('summary.insightsFallback');
    draft.value = {
      title: insights
        ? insightsTitle(plan.sourceTitle)
        : plan.sourceTitle ? t('summary.generatedTitle', {title: plan.sourceTitle}) : t('summary.title'),
      markdown: '',
      tags: [],
      sourceTitle: plan.sourceTitle,
      sourcePath: plan.sourcePath,
      sourceKind: plan.sourceKind,
      sourcePaths: plan.sourcePaths,
    };
    try {
      const result = await summarizeStream(
        plugin,
        plan,
        selectedPromptKey.value,
        {
          onDelta: markdown => {
            if (!isCurrentRun() || !draft.value) return;
            draft.value = {...draft.value, markdown};
          },
        },
        runController.signal,
      );
      if (!isCurrentRun() || runController.signal.aborted) {
        reportTask('cancelled', t('summary.taskCancelled'));
        return;
      }
      draft.value = insights
        ? {...result, title: insightsTitle(plan.sourceTitle || result.sourceTitle || '')}
        : result;
      if (taskId) await saveSummaryHistory();
      reportTask('completed', t(insights ? 'summary.insightsGenerated' : 'summary.taskGenerated'));
    } catch (err: any) {
      if (runController.signal.aborted || !isCurrentRun()) {
        reportTask('cancelled', t('summary.taskCancelled'));
        return;
      }
      error.value = err?.message || t('summary.taskFailed');
      reportTask('failed', t('summary.taskFailed'), error.value);
      dropEmptyDraft();
    } finally {
      if (isCurrentRun()) {
        loading.value = false;
        streamingSummary.value = false;
        controller.value = null;
      }
    }
  };

  const generate = async () => {
    if (loading.value || preparing.value) return;
    panelState.summaryPreset = 'summary';
    preparing.value = true;
    const seq = runSeq;
    let plan: AssistantActionPlan | null = null;
    try {
      if (!(await ensureWiseMindConnected())) return;
      plan = await createAssistantPlan(plugin, 'summary', sourceMode.value, selectedNotes.value);
    } catch (err: any) {
      error.value = err?.message || t('summary.taskFailed');
      return;
    } finally {
      preparing.value = false;
    }
    // Closing the page or opening history while preparing means the user no longer wants this run.
    if (!plan || seq !== runSeq) return;
    await runSummary(plan, `summary-${Date.now()}`);
  };

  const folderTitle = (folder: any) => String(folder?.name || folder?.title || folder?.label || '');
  const folderId = (folder: any) => folder?.id ?? folder?.value ?? '';

  const loadNoteFolders = async () => {
    const folders = await plugin.api.listNoteFolders().catch(() => []);
    noteFolders.value = [
      {value: rootNoteFolderValue, label: t('summary.rootFolder')},
      ...folders.map((folder: any) => ({
        value: String(folderId(folder)),
        label: folderTitle(folder) || String(folderId(folder)),
      })),
    ];
  };

  const loadObsidianFolders = () => {
    const folders = new Set<string>(['']);
    ((plugin.app.vault as any).getAllLoadedFiles?.() || []).forEach((file: any) => {
      if (file?.children && typeof file.path === 'string') folders.add(file.path);
    });
    if (plugin.settings.defaultObsidianRootFolder) folders.add(plugin.settings.defaultObsidianRootFolder);
    obsidianFolders.value = Array.from(folders)
      .sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
      .map(folder => ({value: folder, label: folder || t('summary.rootFolder')}));
  };

  const openObsidianSaveDialog = () => {
    if (!draft.value) return;
    obsidianSaveTitle.value =
      draft.value.sourceTitle ||
      plugin.app.workspace.getActiveFile()?.basename ||
      draft.value.title;
    obsidianSaveMarkdown.value = draft.value.markdown;
    obsidianSaveFolder.value = plugin.settings.defaultObsidianRootFolder || 'WiseMindAI';
    loadObsidianFolders();
    obsidianSaveDialogOpen.value = true;
  };

  const closeObsidianSaveDialog = () => {
    obsidianSaveDialogOpen.value = false;
  };

  const saveToObsidian = async () => {
    if (!draft.value || savingToObsidian.value) return;
    savingToObsidian.value = true;
    try {
      await saveSummaryAsNewNote(plugin, draft.value, {
        folderPath: obsidianSaveFolder.value,
        title: obsidianSaveTitle.value,
        markdown: obsidianSaveMarkdown.value,
      });
      closeObsidianSaveDialog();
      flash('primary');
      markNextSteps('saved');
    } catch (err: any) {
      new Notice(err?.message || t('summary.saveFailed'));
    } finally {
      savingToObsidian.value = false;
    }
  };

  const openSaveDialog = async () => {
    if (!draft.value) return;
    saveTitle.value =
      draft.value.sourceTitle ||
      plugin.app.workspace.getActiveFile()?.basename ||
      draft.value.title;
    saveMarkdown.value = draft.value.markdown;
    saveFolderId.value = rootNoteFolderValue;
    saveDialogOpen.value = true;
    await loadNoteFolders();
  };

  const closeSaveDialog = () => {
    saveDialogOpen.value = false;
  };

  const saveToWiseMind = async () => {
    if (!draft.value || savingToWiseMind.value) return;
    savingToWiseMind.value = true;
    const title = saveTitle.value.trim() || draft.value.title;
    const markdown = saveMarkdown.value.trim() || draft.value.markdown;
    try {
      await plugin.api.createNote({
        title,
        md: markdown,
        markdown,
        content: markdown,
        text: markdown,
        tags: draft.value.tags,
        source: 'obsidian-assistant',
        sourcePath: draft.value.sourcePath,
        from_folder: saveFolderId.value === rootNoteFolderValue ? null : saveFolderId.value,
      });
      closeSaveDialog();
      flash('primary');
      markNextSteps('saved');
      new Notice(t('summary.savedToWiseMind'));
    } catch (err: any) {
      new Notice(err?.message || t('summary.saveFailed'));
    } finally {
      savingToWiseMind.value = false;
    }
  };

  const copyMarkdown = async () => {
    if (!draft.value) return;
    try {
      await navigator.clipboard.writeText(draft.value.markdown);
      flash('copy');
    } catch {
      new Notice(t('rewritePreview.copyFailed'));
    }
  };

  const startEditSummary = async () => {
    if (!draft.value) return;
    editableSummaryMarkdown.value = draft.value.markdown;
    editingSummary.value = true;
    await nextTick();
    editorEl.value?.focus();
  };

  const saveEditedSummary = async () => {
    if (!draft.value || savingEdit.value) return;
    savingEdit.value = true;
    const markdown = editableSummaryMarkdown.value;
    draft.value = {
      ...draft.value,
      markdown,
    };
    try {
      if (currentSummaryHistoryId.value) {
        plugin.settings.assistantSummaryHistory = plugin.settings.assistantSummaryHistory.map(item =>
          item.id === currentSummaryHistoryId.value
            ? {
                ...item,
                markdown,
              }
            : item,
        );
        await plugin.saveSettings();
        notifyTaskHistoryUpdated();
      }
      editingSummary.value = false;
      flash('edit');
    } catch (err: any) {
      new Notice(err?.message || t('summary.saveFailed'));
    } finally {
      savingEdit.value = false;
    }
  };

  const continueChat = () => {
    if (!draft.value) return;
    emit(
      'openChat',
      t('summary.continueChatPrompt', {markdown: draft.value.markdown}),
      false,
      true,
    );
  };

  const generateCardsFromSummary = () => {
    if (!draft.value) return;
    emit('openCards', {
      title: draft.value.sourceTitle || draft.value.title,
      sourcePath: draft.value.sourcePath,
      markdown: draft.value.markdown,
    });
  };

  const cancelGenerate = () => {
    invalidateRun();
    controller.value?.abort();
    if (activeTaskId.value) {
      upsertPluginTask({
        id: activeTaskId.value,
        title: t('summary.taskCancelled'),
        status: 'cancelled',
      });
    }
    controller.value = null;
    loading.value = false;
    streamingSummary.value = false;
    dropEmptyDraft();
  };

  const cancelEditSummary = () => {
    editingSummary.value = false;
    editableSummaryMarkdown.value = '';
  };

  const insertIntoCurrentNote = async () => {
    if (!draft.value || inserting.value) return;
    const hadTarget = hasInsertTarget(plugin);
    inserting.value = true;
    try {
      await insertTextToActiveNote(
        plugin,
        summaryMarkdownBlock(draft.value, t('obsidianMessages.summaryHeading')),
        t('summary.insertedToNote'),
      );
      if (hadTarget) {
        flash('primary');
        markNextSteps('inserted');
      }
    } catch (err: any) {
      new Notice(err?.message || t('summary.saveFailed'));
    } finally {
      inserting.value = false;
    }
  };

  const runSaveDestination = () => {
    if (!draft.value?.markdown || loading.value || editingSummary.value) return;
    if (activeDestination.value === 'insert') void insertIntoCurrentNote();
    else if (activeDestination.value === 'newNote') openObsidianSaveDialog();
    else void openSaveDialog();
  };

  // The close button comes first in the dialog, so focus the title field instead of reka's default target.
  const focusDialogField = (event: Event, field: HTMLInputElement | null) => {
    if (!field) return;
    event.preventDefault();
    field.focus();
    field.select();
  };

  const isPlainEnter = (event: KeyboardEvent) =>
    event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229;

  const onDialogTitleKeydown = (event: KeyboardEvent, submit: () => unknown) => {
    if (!isPlainEnter(event)) return;
    event.preventDefault();
    void submit();
  };

  const onEditorKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    cancelEditSummary();
  };

  const onPageKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (editingSummary.value) void saveEditedSummary();
    else if (draft.value) runSaveDestination();
    else if (canGenerateSummary.value) void generate();
  };

  const openHistoryItem = (id?: string) => {
    if (!id) return;
    const item = plugin.settings.assistantSummaryHistory.find(history => history.id === id);
    if (!item) return;
    currentSummaryHistoryId.value = item.id;
    sourceMode.value =
      item.sourceKind === 'multi-note'
        ? 'multi'
        : item.sourceKind === 'selection'
          ? 'selection'
          : 'current';
    selectedNotes.value = [];
    editingSummary.value = false;
    editableSummaryMarkdown.value = '';
    draft.value = {
      title: item.summaryTitle || item.title,
      summaryTitle: item.summaryTitle,
      markdown: item.markdown,
      tags: item.tags,
      sourceTitle: item.sourceTitle,
      sourcePath: item.sourcePath,
      sourceKind: item.sourceKind,
      sourcePaths: item.sourcePaths,
    };
    error.value = '';
    loading.value = false;
    streamingSummary.value = false;
    invalidateRun();
    controller.value?.abort();
    controller.value = null;
  };

  const resetSummaryState = () => {
    invalidateRun();
    controller.value?.abort();
    controller.value = null;
    sourceMode.value = 'current';
    selectedNotes.value = [];
    pickerOpen.value = false;
    loading.value = false;
    streamingSummary.value = false;
    error.value = '';
    draft.value = null;
    currentSummaryHistoryId.value = '';
    editingSummary.value = false;
    editableSummaryMarkdown.value = '';
    saveDialogOpen.value = false;
    obsidianSaveDialogOpen.value = false;
  };

  const onExternalAction = (event: Event) => {
    const plan = (event as CustomEvent).detail;
    if (plan?.kind !== 'summary') return;
    resetSummaryState();
    void runSummary(plan as AssistantActionPlan);
  };

  onMounted(() => {
    window.addEventListener('wisemindai:assistant-action', onExternalAction);
    window.addEventListener('focus', loadSummaryPrompts);
    const workspace = plugin.app.workspace;
    workspaceEventRefs.push(workspace.on('file-open', refreshCurrentNotePath));
    workspaceEventRefs.push(workspace.on('active-leaf-change', refreshCurrentNotePath));
    refreshCurrentNotePath();
    void loadSummaryPrompts();
  });
  onUnmounted(() => {
    window.removeEventListener('wisemindai:assistant-action', onExternalAction);
    window.removeEventListener('focus', loadSummaryPrompts);
    workspaceEventRefs.forEach(ref => plugin.app.workspace.offref(ref));
    workspaceEventRefs.splice(0);
    window.clearTimeout(promptReloadTimer);
    if (loading.value) cancelGenerate();
    else invalidateRun();
  });

  watch(
    () => props.historyToken,
    () => openHistoryItem(props.historyItemId),
    {immediate: true},
  );

  watch(
    () => props.resetToken,
    value => {
      if (value) resetSummaryState();
    },
  );
</script>

<template>
  <section class="wm2-sum" @keydown="onPageKeydown">
    <div class="wm2-sum-body">
    <section class="wm2-card wm2-sum-source">
      <div class="wm2-sum-source-head">
        <DocumentTextIcon class="wm-icon wm2-sum-source-icon" />
        <span class="wm2-sum-source-label">{{ t('summary.sourcePreview') }}</span>
        <strong
          class="wm2-truncate wm2-sum-source-name"
          :class="{'wm2-text-warning': currentSourceUnavailable && !draft}"
          :title="sourceLabel"
          >{{ sourceLabel }}</strong
        >
        <WmTooltip v-if="sourceMode === 'current' && sourceNotePath" :content="t('sourceNotes.openNote')">
          <button class="wm2-icon-btn is-sm" type="button" @click="openSourceNote">
            <span class="wm-visually-hidden">{{ t('sourceNotes.openNote') }}</span>
            <ArrowTopRightOnSquareIcon class="wm-icon" />
          </button>
        </WmTooltip>
      </div>
      <SourceSelector
        v-model="sourceMode"
        :multi-count="selectedNotes.length"
        @pick-multi="
          pickerOpen = true;
          sourceMode = 'multi';
        "
      />
      <AssistantSourceNotes
        v-if="sourceMode === 'multi'"
        :mode="sourceMode"
        :current-path="currentNotePath"
        :selected-notes="selectedNotes"
        @remove="removeSelectedNote"
      />
      <p v-if="currentSourceUnavailable && draft" class="wm2-text-warning">{{ t('summary.noOpenNote') }}</p>
    </section>

    <div v-if="error" class="wm2-sum-error" role="alert">
      <span>{{ error }}</span>
      <button class="wm2-btn is-ghost is-xs" type="button" :disabled="!canGenerateSummary" @click="generate">
        <ArrowPathIcon class="wm-icon" />
        {{ t('common.retry') }}
      </button>
    </div>

    <article class="wm2-card wm2-sum-card">
      <header class="wm2-sum-card-head">
        <ListBulletIcon class="wm-icon wm2-sum-card-icon" />
        <span class="wm2-sum-card-title">{{ t('assistant.summary') }}</span>
        <span v-if="draft && draftSourceTitle" class="wm2-truncate wm2-sum-card-source" :title="draftSourceTitle">
          · {{ draftSourceTitle }}
        </span>
        <span v-if="streamingSummary" class="wm2-spinner"></span>
        <div class="wm2-sum-card-tools">
          <SelectRoot
            :model-value="selectedPromptKey"
            @update:model-value="value => (selectedPromptKey = String(value))"
          >
            <SelectTrigger
              class="wm2-btn is-ghost is-xs wm2-sum-template"
              :disabled="loading || promptListLoading"
              :aria-label="t('summary.promptAriaLabel')"
              :title="selectedPromptName || t('summary.promptAriaLabel')"
            >
              <span v-if="promptListLoading" class="wm2-spinner"></span>
              <span class="wm2-truncate"><SelectValue :placeholder="t('summary.promptPlaceholder')" /></span>
              <ChevronDownIcon class="wm-icon wm2-sum-template-caret" />
            </SelectTrigger>
            <SelectPortal>
              <SelectContent class="wm2-sum-select" position="popper" align="end" :side-offset="4">
                <SelectViewport class="wm2-sum-select-viewport">
                  <SelectItem
                    v-for="option in summaryPromptOptions"
                    :key="option.key"
                    class="wm2-sum-select-item"
                    :value="option.key"
                  >
                    <SelectItemText>{{ option.name }}</SelectItemText>
                    <CheckIcon v-if="option.key === selectedPromptKey" class="wm-icon" />
                  </SelectItem>
                </SelectViewport>
                <div class="wm2-sum-select-footer">
                  <button class="wm2-btn is-sm is-block" type="button" @click.stop="openCreateSummaryPrompt">
                    <PlusIcon class="wm-icon" />
                    {{ t('summary.newPrompt') }}
                  </button>
                </div>
              </SelectContent>
            </SelectPortal>
          </SelectRoot>
          <WmTooltip v-if="draft || loading" :content="t('summary.close')">
            <button class="wm2-icon-btn is-sm" type="button" @click="resetSummaryState">
              <span class="wm-visually-hidden">{{ t('summary.close') }}</span>
              <XMarkIcon class="wm-icon" />
            </button>
          </WmTooltip>
        </div>
      </header>

      <template v-if="draft">
        <div
          ref="bodyEl"
          class="wm2-sum-card-body"
          :class="{'wm2-stream-caret': streamingSummary && draft.markdown}"
          :aria-busy="streamingSummary"
        >
          <textarea
            v-if="editingSummary"
            ref="editorEl"
            v-model="editableSummaryMarkdown"
            class="wm2-sum-editor"
            :aria-label="t('summary.editPlaceholder')"
            :placeholder="t('summary.editPlaceholder')"
            @keydown="onEditorKeydown"
          ></textarea>
          <StreamingMarkdownView v-else :content="draft.markdown" :streaming="streamingSummary" />
          <div v-if="streamingSummary && !draft.markdown" class="wm2-skeleton-lines" aria-hidden="true">
            <span class="wm2-skeleton"></span>
            <span class="wm2-skeleton"></span>
            <span class="wm2-skeleton is-short"></span>
          </div>
        </div>
        <footer class="wm2-sum-card-actions">
          <template v-if="editingSummary">
            <button class="wm2-btn is-primary is-xs" type="button" :disabled="savingEdit" @click="saveEditedSummary">
              <span v-if="savingEdit" class="wm2-spinner"></span>
              <CheckIcon v-else class="wm-icon" />
              {{ savingEdit ? t('summary.saving') : t('summary.saveEdit') }}
            </button>
            <button class="wm2-btn is-ghost is-xs" type="button" :disabled="savingEdit" @click="cancelEditSummary">
              {{ t('summary.cancel') }}
            </button>
            <kbd class="wm2-sum-kbd-hint">Esc</kbd>
          </template>
          <template v-else>
            <button class="wm2-btn is-ghost is-xs" type="button" :disabled="loading" @click="startEditSummary">
              <PencilSquareIcon class="wm-icon" />
              {{ t('summary.edit') }}
            </button>
            <WmTooltip v-if="generateBlockedReason" :content="generateBlockedReason">
              <span class="wm2-disabled-tip" tabindex="0">
                <button class="wm2-btn is-ghost is-xs" type="button" disabled>
                  <ArrowPathIcon class="wm-icon" />
                  {{ t('summary.regenerate') }}
                </button>
              </span>
            </WmTooltip>
            <button v-else class="wm2-btn is-ghost is-xs" type="button" :disabled="!canGenerateSummary" @click="generate">
              <span v-if="preparing" class="wm2-spinner"></span>
              <ArrowPathIcon v-else class="wm-icon" />
              {{ t('summary.regenerate') }}
            </button>
            <button class="wm2-btn is-ghost is-xs" type="button" :disabled="loading" @click="generateCardsFromSummary">
              <BookmarkSquareIcon class="wm-icon" />
              {{ t('summary.generateCards') }}
            </button>
            <button class="wm2-btn is-ghost is-xs" type="button" :disabled="loading" @click="continueChat">
              <ChatBubbleOvalLeftEllipsisIcon class="wm-icon" />
              {{ t('summary.continueChat') }}
            </button>
          </template>
          <span v-if="isFlashing('edit') && !editingSummary" class="wm2-flash-done wm2-sum-flash" role="status">
            <CheckIcon class="wm-icon" />
            {{ t('summary.editSaved') }}
          </span>
          <WmTooltip :content="isFlashing('copy') ? t('shared.copied') : t('summary.copy')">
            <button
              class="wm2-icon-btn is-sm wm2-sum-copy wm2-copy-btn"
              :class="{'is-done': isFlashing('copy')}"
              type="button"
              :disabled="!draft.markdown"
              @click="copyMarkdown"
            >
              <template v-if="isFlashing('copy')">
                <CheckIcon class="wm-icon" />
                <span aria-live="polite">{{ t('shared.copied') }}</span>
              </template>
              <template v-else>
                <span class="wm-visually-hidden">{{ t('summary.copy') }}</span>
                <ClipboardDocumentIcon class="wm-icon" />
              </template>
            </button>
          </WmTooltip>
        </footer>
      </template>

      <div v-else-if="loading" class="wm2-empty is-compact wm2-sum-empty">
        <span class="wm2-spinner wm2-sum-empty-spinner"></span>
        <p>{{ t(panelState.summaryPreset === 'insights' ? 'summary.insightsGenerating' : 'summary.generatingSummary') }}</p>
        <button class="wm2-btn is-sm" type="button" @click="cancelGenerate">
          <StopIcon class="wm-icon" />
          {{ t('summary.cancelGenerate') }}
        </button>
      </div>

      <div v-else class="wm2-empty is-compact wm2-sum-empty">
        <SparklesIcon class="wm2-empty-icon" />
        <p>{{ t('summary.empty') }}</p>
        <div class="wm2-row wm2-center">
          <WmTooltip v-if="generateBlockedReason" :content="generateBlockedReason">
            <span class="wm2-disabled-tip" tabindex="0">
              <button class="wm2-btn is-primary is-sm" type="button" disabled>
                <SparklesIcon class="wm-icon" />
                {{ t('summary.generate') }}
              </button>
            </span>
          </WmTooltip>
          <button v-else class="wm2-btn is-primary is-sm" type="button" :disabled="!canGenerateSummary" @click="generate">
            <span v-if="preparing" class="wm2-spinner is-on-primary"></span>
            <SparklesIcon v-else class="wm-icon" />
            {{ t('summary.generate') }}
          </button>
          <button class="wm2-btn is-ghost is-sm" type="button" @click="emit('openHistory')">
            <ClockIcon class="wm-icon" />
            {{ t('summary.history') }}
          </button>
        </div>
      </div>
    </article>

    <Transition name="wm2-view">
    <section v-if="draft && !loading" class="wm2-section">
      <h4 class="wm2-section-title">
        <span>{{ t('summary.saveSection') }}</span>
        <button class="wm2-link-button" type="button" @click="emit('openSync')">
          <ArrowPathIcon class="wm-icon" />
          {{ t('summary.goSync') }}
        </button>
      </h4>
      <div class="wm2-sum-dest-grid" :class="{'is-two': destinationOptions.length === 2}">
        <button
          v-for="option in destinationOptions"
          :key="option.key"
          class="wm2-sum-dest"
          :class="{'is-active': option.key === activeDestination}"
          type="button"
          :aria-pressed="option.key === activeDestination"
          @click="saveDestination = option.key"
        >
          <component :is="option.icon" class="wm-icon" />
          <span class="wm2-truncate">{{ option.label }}</span>
        </button>
      </div>
      <p class="wm2-sum-dest-hint">{{ destinationHint }}</p>
    </section>
    </Transition>

    <ResultNextSteps
      v-if="showNextSteps && draft && !loading"
      kind="summary"
      :title="draft.title"
      :source-path="draft.sourcePath"
      :markdown="draft.markdown"
      :success-text="
        nextStepsVariant === 'inserted' ? t('resultNextSteps.summaryInserted') : t('resultNextSteps.summarySaved')
      "
      :success-desc="
        nextStepsVariant === 'inserted'
          ? t('resultNextSteps.summaryInsertedDesc')
          : t('resultNextSteps.summarySavedDesc')
      "
      @open-cards="
        emit('openCards', {
          title: draft.title,
          sourcePath: draft.sourcePath,
          markdown: draft.markdown,
        })
      "
    />
    </div>

    <footer v-if="draft" class="wm2-sum-footer">
      <span class="wm2-truncate wm2-sum-footer-hint">
        <template v-if="!loading">
          <kbd>{{ shortcutLabel }}</kbd>
          {{ editingSummary ? t('summary.saveEdit') : primaryActionLabel }}
        </template>
      </span>
      <button v-if="loading" class="wm2-btn is-sm" type="button" @click="cancelGenerate">
        <StopIcon class="wm-icon" />
        {{ t('summary.cancelGenerate') }}
      </button>
      <button
        v-else
        class="wm2-btn is-primary is-sm"
        :class="{'is-done': isFlashing('primary')}"
        type="button"
        :disabled="editingSummary || !draft.markdown || inserting"
        :title="primaryActionLabel"
        @click="runSaveDestination"
      >
        <span v-if="inserting" class="wm2-spinner is-on-primary"></span>
        <CheckIcon v-else-if="isFlashing('primary')" class="wm-icon" />
        <component :is="primaryActionIcon" v-else class="wm-icon" />
        <span class="wm2-truncate" aria-live="polite">{{
          isFlashing('primary') ? (activeDestination === 'insert' ? t('shared.inserted') : t('shared.saved')) : primaryActionLabel
        }}</span>
      </button>
    </footer>

    <NotePickerDialog
      v-model:open="pickerOpen"
      :selected-paths="selectedNotes.map(note => note.path)"
      @confirm="
        selectedNotes = $event;
        pickerOpen = false;
      "
    />
    <WiseMindConnectionDialog v-model:open="connectionDialogOpen" />

    <DialogRoot v-model:open="obsidianSaveDialogOpen">
      <DialogPortal to="#wisemindai-obsidian-root">
        <DialogOverlay class="wm-modal-overlay" @click.self="closeObsidianSaveDialog">
          <DialogContent
            class="wm-modal-box wm2-sum-dialog"
            @open-auto-focus="focusDialogField($event, obsidianTitleInput)"
          >
            <DialogTitle class="wm2-sum-dialog-title">{{ t('summary.saveNewNote') }}</DialogTitle>
            <DialogDescription class="wm-visually-hidden">
              {{ t('summary.saveToObsidianFolder') }}
            </DialogDescription>
            <button
              class="wm2-icon-btn wm2-sum-dialog-close"
              type="button"
              :aria-label="t('summary.close')"
              @click="closeObsidianSaveDialog"
            >
              <XMarkIcon class="wm-icon" />
            </button>

            <label class="wm2-sum-field">
              <span>{{ t('summary.noteTitle') }}</span>
              <input
                ref="obsidianTitleInput"
                v-model="obsidianSaveTitle"
                type="text"
                :placeholder="t('summary.noteTitlePlaceholder')"
                @keydown="onDialogTitleKeydown($event, saveToObsidian)"
              />
            </label>

            <label class="wm2-sum-field">
              <span>{{ t('summary.saveToObsidianFolder') }}</span>
              <RekaSearchSelect
                v-model="obsidianSaveFolder"
                :options="obsidianFolders"
                :placeholder="t('summary.chooseObsidianFolder')"
                :search-placeholder="t('summary.searchObsidianFolder')"
                :empty-text="t('summary.noMatchedFolder')"
                disable-portal
              />
            </label>

            <label class="wm2-sum-field">
              <span>{{ t('summary.noteContent') }}</span>
              <textarea
                v-model="obsidianSaveMarkdown"
                class="wm2-sum-dialog-content"
                :placeholder="t('summary.noteContentPlaceholder')"
              ></textarea>
            </label>

            <footer class="wm2-dialog-actions">
              <button class="wm2-btn is-sm" type="button" @click="closeObsidianSaveDialog">
                <XMarkIcon class="wm-icon" />
                {{ t('summary.cancel') }}
              </button>
              <button class="wm2-btn is-primary is-sm" type="button" :disabled="savingToObsidian" @click="saveToObsidian">
                <span v-if="savingToObsidian" class="wm2-spinner"></span>
                <DocumentPlusIcon v-else class="wm-icon" />
                {{ savingToObsidian ? t('summary.saving') : t('summary.save') }}
              </button>
            </footer>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot v-model:open="saveDialogOpen">
      <DialogPortal to="#wisemindai-obsidian-root">
        <DialogOverlay class="wm-modal-overlay" @click.self="closeSaveDialog">
          <DialogContent
            class="wm-modal-box wm2-sum-dialog"
            @open-auto-focus="focusDialogField($event, wiseMindTitleInput)"
          >
            <DialogTitle class="wm2-sum-dialog-title">{{ t('summary.saveToWiseMind') }}</DialogTitle>
            <DialogDescription class="wm-visually-hidden">
              {{ t('summary.chooseWiseMindFolder') }}
            </DialogDescription>
            <button
              class="wm2-icon-btn wm2-sum-dialog-close"
              type="button"
              :aria-label="t('summary.close')"
              @click="closeSaveDialog"
            >
              <XMarkIcon class="wm-icon" />
            </button>

            <label class="wm2-sum-field">
              <span>{{ t('summary.noteTitle') }}</span>
              <input
                ref="wiseMindTitleInput"
                v-model="saveTitle"
                type="text"
                :placeholder="t('summary.noteTitlePlaceholder')"
                @keydown="onDialogTitleKeydown($event, saveToWiseMind)"
              />
            </label>

            <label class="wm2-sum-field">
              <span>{{ t('summary.saveFolder') }}</span>
              <RekaSelect
                v-model="saveFolderId"
                :options="noteFolders"
                :placeholder="t('summary.chooseWiseMindFolder')"
              />
            </label>

            <label class="wm2-sum-field">
              <span>{{ t('summary.noteContent') }}</span>
              <textarea
                v-model="saveMarkdown"
                class="wm2-sum-dialog-content"
                :placeholder="t('summary.noteContentPlaceholder')"
              ></textarea>
            </label>

            <footer class="wm2-dialog-actions">
              <button class="wm2-btn is-sm" type="button" @click="closeSaveDialog">
                <XMarkIcon class="wm-icon" />
                {{ t('summary.cancel') }}
              </button>
              <button class="wm2-btn is-primary is-sm" type="button" :disabled="savingToWiseMind" @click="saveToWiseMind">
                <span v-if="savingToWiseMind" class="wm2-spinner"></span>
                <CircleStackIcon v-else class="wm-icon" />
                {{ savingToWiseMind ? t('summary.saving') : t('summary.save') }}
              </button>
            </footer>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </DialogRoot>
  </section>
</template>
