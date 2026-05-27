<script setup lang="ts">
  import {computed, onMounted, onUnmounted, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowPathIcon,
    BookmarkSquareIcon,
    ChatBubbleOvalLeftEllipsisIcon,
    CheckCircleIcon,
    ChevronDownIcon,
    ClipboardDocumentIcon,
    ClockIcon,
    DocumentPlusIcon,
    DocumentTextIcon,
    PencilSquareIcon,
    PlusIcon,
    XMarkIcon,
  } from '@heroicons/vue/24/outline';
  import {Notice} from 'obsidian';
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

  import {usePlugin} from '../../composables/usePlugin';
  import {useWiseMindConnectionGuard} from '../../composables/useWiseMindConnectionGuard';
  import {createAssistantPlan, type SourceMode, summarize} from '../../services/assistantService';
  import {
    insertTextToActiveNote,
    saveSummaryAsNewNote,
    summaryMarkdownBlock,
  } from '../../services/noteWriter';
  import {upsertPluginTask} from '../../services/pluginTaskProgress';
  import {notifyTaskHistoryUpdated} from '../../services/taskHistory';
  import type {AssistantSummaryDraft, ObsidianSourceItem} from '../../types';
  import AssistantSourceNotes from '../AssistantSourceNotes.vue';
  import MarkdownView from '../MarkdownView.vue';
  import NotePickerDialog from '../NotePickerDialog.vue';
  import RekaSearchSelect from '../RekaSearchSelect.vue';
  import RekaSelect from '../RekaSelect.vue';
  import SourceSelector from '../SourceSelector.vue';
  import WiseMindConnectionDialog from '../WiseMindConnectionDialog.vue';
  import WmTooltip from '../WmTooltip.vue';

  const props = defineProps<{
    historyItemId?: string;
    historyToken?: number;
    resetToken?: number;
  }>();
  const emit = defineEmits<{
    openHistory: [];
    openChat: [message: string];
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
  const promptOptions = ref<Array<{key: string; name: string; order?: number; icon?: string}>>([]);
  const selectedPromptKey = ref('');
  const promptListLoading = ref(false);
  const defaultPromptOption = {
    key: 'system-summary-markdown',
    name: t('summary.defaultPromptName'),
    order: 1,
  };

  const sourceLabel = computed(() => {
    if (draft.value?.sourcePath || draft.value?.sourceTitle) {
      return draft.value.sourcePath || draft.value.sourceTitle || '';
    }
    if (sourceMode.value === 'selection') return t('summary.selectedText');
    if (sourceMode.value === 'multi')
      return selectedNotes.value.length
        ? t('summary.selectedNotes', {count: selectedNotes.value.length})
        : t('summary.noSelectedNotes');
    return plugin.app.workspace.getActiveFile()?.path || t('summary.noOpenNote');
  });
  const currentNotePath = computed(() => plugin.app.workspace.getActiveFile()?.path || '');
  const summaryPromptOptions = computed(() => {
    return promptOptions.value.length ? promptOptions.value : [defaultPromptOption];
  });

  const removeSelectedNote = (path: string) => {
    selectedNotes.value = selectedNotes.value.filter(note => note.path !== path);
  };

  const loadSummaryPrompts = async () => {
    promptListLoading.value = true;
    try {
      const result = await plugin.api.listAssistantPrompts('documentSummary');
      promptOptions.value = Array.isArray(result.options) ? result.options : [];
      const nextDefault = result.defaultPromptKey || promptOptions.value[0]?.key || defaultPromptOption.key;
      if (!selectedPromptKey.value || !summaryPromptOptions.value.some(item => item.key === selectedPromptKey.value)) {
        selectedPromptKey.value = nextDefault;
      }
    } catch {
      promptOptions.value = [defaultPromptOption];
      selectedPromptKey.value ||= defaultPromptOption.key;
    } finally {
      promptListLoading.value = false;
    }
  };

  const openCreateSummaryPrompt = async () => {
    selectedPromptKey.value = promptOptions.value[0]?.key || defaultPromptOption.key;
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
    window.setTimeout(() => void loadSummaryPrompts(), 1200);
  };

  const generate = async () => {
    if (!(await ensureWiseMindConnected())) return;
    const plan = await createAssistantPlan(
      plugin,
      'summary',
      sourceMode.value,
      selectedNotes.value,
    );
    if (!plan) return;
    controller.value?.abort();
    controller.value = new AbortController();
    const taskId = `summary-${Date.now()}`;
    activeTaskId.value = taskId;
    upsertPluginTask({
      id: taskId,
      title: t('summary.taskGenerating'),
      status: 'running',
    });
    loading.value = true;
    error.value = '';
    try {
      draft.value = await summarize(plugin, plan, selectedPromptKey.value, controller.value.signal);
      const historyId = `summary-${Date.now()}`;
      currentSummaryHistoryId.value = historyId;
      editingSummary.value = false;
      editableSummaryMarkdown.value = '';
      const summaryTitle = draft.value.title;
      plugin.settings.assistantSummaryHistory.unshift({
        ...draft.value,
        title: draft.value.sourceTitle || draft.value.title,
        summaryTitle,
        id: historyId,
        createdAt: Date.now(),
      });
      plugin.settings.assistantSummaryHistory = plugin.settings.assistantSummaryHistory.slice(
        0,
        50,
      );
      await plugin.saveSettings();
      notifyTaskHistoryUpdated();
      upsertPluginTask({
        id: taskId,
        title: t('summary.taskGenerated'),
        status: 'completed',
      });
    } catch (err: any) {
      if (!controller.value?.signal.aborted) {
        error.value = err?.message || t('summary.taskFailed');
        upsertPluginTask({
          id: taskId,
          title: t('summary.taskFailed'),
          status: 'failed',
          message: error.value,
        });
      } else {
        upsertPluginTask({
          id: taskId,
          title: t('summary.taskCancelled'),
          status: 'cancelled',
        });
      }
    } finally {
      loading.value = false;
      controller.value = null;
    }
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
      new Notice(t('summary.savedToWiseMind'));
    } finally {
      savingToWiseMind.value = false;
    }
  };

  const copyMarkdown = async () => {
    if (!draft.value) return;
    await globalThis.navigator?.clipboard?.writeText(draft.value.markdown);
    new Notice(t('summary.markdownCopied'));
  };

  const startEditSummary = () => {
    if (!draft.value) return;
    editableSummaryMarkdown.value = draft.value.markdown;
    editingSummary.value = true;
  };

  const saveEditedSummary = async () => {
    if (!draft.value) return;
    const markdown = editableSummaryMarkdown.value;
    draft.value = {
      ...draft.value,
      markdown,
    };
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
    new Notice(t('summary.editSaved'));
  };

  const continueChat = () => {
    if (!draft.value) return;
    emit(
      'openChat',
      t('summary.continueChatPrompt', {markdown: draft.value.markdown}),
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
    controller.value?.abort();
    controller.value = null;
  };

  const resetSummaryState = () => {
    controller.value?.abort();
    controller.value = null;
    sourceMode.value = 'current';
    selectedNotes.value = [];
    pickerOpen.value = false;
    loading.value = false;
    error.value = '';
    draft.value = null;
    currentSummaryHistoryId.value = '';
    editingSummary.value = false;
    editableSummaryMarkdown.value = '';
    saveDialogOpen.value = false;
  };

  const onExternalAction = (event: Event) => {
    const plan = (event as CustomEvent).detail;
    if (plan?.kind !== 'summary') return;
    void (async () => {
      resetSummaryState();
      loading.value = true;
      try {
        draft.value = await summarize(plugin, plan, selectedPromptKey.value);
        currentSummaryHistoryId.value = '';
      } finally {
        loading.value = false;
      }
    })();
  };

  onMounted(() => {
    window.addEventListener('wisemindai:assistant-action', onExternalAction);
    window.addEventListener('focus', loadSummaryPrompts);
    void loadSummaryPrompts();
  });
  onUnmounted(() => {
    window.removeEventListener('wisemindai:assistant-action', onExternalAction);
    window.removeEventListener('focus', loadSummaryPrompts);
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
  <section class="wm-page">
    <header class="wm-page-header">
      <div class="wm-title-line">
        <DocumentTextIcon class="wm-title-icon" />
        <h2>{{ t('summary.title') }}</h2>
      </div>
      <div class="wm-toolbar">
        <button v-if="loading" class="wm-button" type="button" @click="cancelGenerate"
          >{{ t('summary.cancelGenerate') }}</button
        >
        <WmTooltip :content="t('summary.history')">
          <button class="wm-icon-button" type="button" @click="emit('openHistory')">
            <ClockIcon class="wm-icon" />
          </button>
        </WmTooltip>
        <WmTooltip :content="t('summary.close')">
          <button class="wm-icon-button" type="button" @click="resetSummaryState">
            <XMarkIcon class="wm-icon" />
          </button>
        </WmTooltip>
      </div>
    </header>

    <section class="wm-panel wm-summary-source-panel">
      <div class="wm-panel-title">
        <DocumentTextIcon class="wm-panel-title-icon" />
        <div class="wm-section-title">{{ t('summary.sourceSection') }}</div>
      </div>
      <SourceSelector
        v-model="sourceMode"
        :multi-count="selectedNotes.length"
        @pick-multi="
          pickerOpen = true;
          sourceMode = 'multi';
        "
      />
      <p class="wm-source-preview"
        >{{ t('summary.sourcePreview') }} <strong>{{ sourceLabel }}</strong></p
      >
      <AssistantSourceNotes
        :mode="sourceMode"
        :current-path="currentNotePath"
        :selected-notes="selectedNotes"
        @remove="removeSelectedNote"
      />
    </section>

    <div v-if="error" class="wm-alert is-error">{{ error }}</div>

    <article v-if="draft" class="wm-preview">
      <header class="wm-preview-header">
        <h3>{{ draft.title }}</h3>
      </header>
      <textarea
        v-if="editingSummary"
        v-model="editableSummaryMarkdown"
        class="wm-textarea wm-summary-edit-content"
        :placeholder="t('summary.editPlaceholder')"
      ></textarea>
      <MarkdownView v-else :markdown="draft.markdown" :source-path="draft.sourcePath" />
      <footer class="wm-summary-action-groups">
        <section class="wm-summary-action-group">
          <h4><ClipboardDocumentIcon class="wm-icon" /> {{ t('summary.refineSection') }}</h4>
          <div class="wm-summary-action-row">
            <button class="wm-button" type="button" @click="generate">
              <ArrowPathIcon class="wm-icon" /> {{ t('summary.regenerate') }}
            </button>
            <button
              v-if="editingSummary"
              class="wm-button is-primary"
              type="button"
              @click="saveEditedSummary"
            >
              <CheckCircleIcon class="wm-icon" /> {{ t('summary.saveEdit') }}
            </button>
            <button v-else class="wm-button" type="button" @click="startEditSummary">
              <PencilSquareIcon class="wm-icon" /> {{ t('summary.edit') }}
            </button>
            <button class="wm-button" type="button" @click="copyMarkdown">
              <ClipboardDocumentIcon class="wm-icon" /> {{ t('summary.copy') }}
            </button>
          </div>
        </section>

        <section class="wm-summary-action-group">
          <h4><ChatBubbleOvalLeftEllipsisIcon class="wm-icon" /> {{ t('summary.deepenSection') }}</h4>
          <div class="wm-summary-action-row">
            <button class="wm-button" type="button" @click="continueChat">
              <ChatBubbleOvalLeftEllipsisIcon class="wm-icon" /> {{ t('summary.continueChat') }}
            </button>
            <button class="wm-button" type="button" @click="generateCardsFromSummary">
              <BookmarkSquareIcon class="wm-icon" /> {{ t('summary.generateCards') }}
            </button>
            <button class="wm-button" type="button" @click="emit('openSync')">
              <ArrowPathIcon class="wm-icon" /> {{ t('summary.goSync') }}
            </button>
          </div>
        </section>

        <section class="wm-summary-action-group">
          <h4><DocumentPlusIcon class="wm-icon" /> {{ t('summary.saveSection') }}</h4>
          <div class="wm-summary-action-row">
            <button
              v-if="sourceMode !== 'multi'"
              class="wm-button"
              type="button"
              @click="
                insertTextToActiveNote(plugin, summaryMarkdownBlock(draft), t('summary.insertedToNote'))
              "
            >
              <PencilSquareIcon class="wm-icon" /> {{ t('summary.insertCurrentNote') }}
            </button>
            <button class="wm-button" type="button" @click="openObsidianSaveDialog">
              <DocumentPlusIcon class="wm-icon" /> {{ t('summary.saveNewNote') }}
            </button>
            <button class="wm-button" type="button" @click="openSaveDialog">
              <DocumentTextIcon class="wm-icon" /> {{ t('summary.saveToWiseMind') }}
            </button>
          </div>
        </section>
      </footer>
    </article>

    <section v-else class="wm-panel wm-summary-empty">
      <div v-if="loading" class="wm-summary-generating-state">
        <span class="wm-loading-spinner"></span>
        <p>{{ t('summary.generatingSummary') }}</p>
      </div>
      <p v-else class="wm:text-center wm:py-4">{{ t('summary.empty') }}</p>
    </section>

    <div v-if="!draft" class="wm-generate-row">
      <button v-if="loading" class="wm-button" type="button" @click="cancelGenerate">
        {{ t('summary.cancelGenerate') }}
      </button>
      <SelectRoot
        :model-value="selectedPromptKey"
        @update:model-value="value => selectedPromptKey = String(value)"
      >
        <SelectTrigger
          class="wm-select-trigger wm-summary-prompt-select"
          :disabled="loading || promptListLoading"
          :aria-label="t('summary.promptAriaLabel')"
        >
          <SelectValue :placeholder="t('summary.promptPlaceholder')" />
          <ChevronDownIcon class="wm-icon" />
        </SelectTrigger>
        <SelectPortal>
          <SelectContent class="wm-select-content wm-summary-prompt-content" position="popper" :side-offset="4">
            <SelectViewport class="wm-select-viewport">
              <SelectItem
                v-for="option in summaryPromptOptions"
                :key="option.key"
                class="wm-select-item"
                :value="option.key"
              >
                <SelectItemText>{{ option.name }}</SelectItemText>
              </SelectItem>
            </SelectViewport>
            <div class="wm-select-footer">
              <button class="wm-button is-primary wm:w-full" type="button" @click.stop="openCreateSummaryPrompt">
                <PlusIcon class="wm-icon" />
                {{ t('summary.newPrompt') }}
              </button>
            </div>
          </SelectContent>
        </SelectPortal>
      </SelectRoot>
      <button
        class="wm-button is-primary"
        type="button"
        :disabled="loading"
        @click="generate"
      >
        <span v-if="loading" class="wm-loading-spinner"></span>
        <ArrowPathIcon v-else class="wm-icon" />
        {{ loading ? t('summary.generating') : t('summary.generate') }}
      </button>
    </div>

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
          <DialogContent class="wm-modal-box wm-summary-save-dialog">
            <DialogTitle class="wm-dialog-title">{{ t('summary.saveNewNote') }}</DialogTitle>
            <DialogDescription class="wm-visually-hidden">
              {{ t('summary.saveToObsidianFolder') }}
            </DialogDescription>
            <button
              class="btn btn-sm btn-circle btn-ghost absolute right-4 top-4"
              type="button"
              :aria-label="t('summary.close')"
              @click="closeObsidianSaveDialog"
            >
              ✕
            </button>

            <label class="wm-form-field">
              <span>{{ t('summary.noteTitle') }}</span>
              <input v-model="obsidianSaveTitle" class="wm-input" :placeholder="t('summary.noteTitlePlaceholder')" />
            </label>

            <label class="wm-form-field">
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

            <label class="wm-form-field">
              <span>{{ t('summary.noteContent') }}</span>
              <textarea
                v-model="obsidianSaveMarkdown"
                class="wm-textarea wm-summary-save-content"
                :placeholder="t('summary.noteContentPlaceholder')"
              ></textarea>
            </label>

            <footer class="wm-dialog-actions">
              <button class="wm-button" type="button" @click="closeObsidianSaveDialog">{{ t('summary.cancel') }}</button>
              <button
                class="wm-button is-primary"
                type="button"
                :disabled="savingToObsidian"
                @click="saveToObsidian"
              >
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
          <DialogContent class="wm-modal-box wm-summary-save-dialog">
            <DialogTitle class="wm-dialog-title">{{ t('summary.saveToWiseMind') }}</DialogTitle>
            <DialogDescription class="wm-visually-hidden">
              {{ t('summary.chooseWiseMindFolder') }}
            </DialogDescription>
            <button
              class="btn btn-sm btn-circle btn-ghost absolute right-4 top-4"
              type="button"
              :aria-label="t('summary.close')"
              @click="closeSaveDialog"
            >
              ✕
            </button>

            <label class="wm-form-field">
              <span>{{ t('summary.noteTitle') }}</span>
              <input v-model="saveTitle" class="wm-input" :placeholder="t('summary.noteTitlePlaceholder')" />
            </label>

            <label class="wm-form-field">
              <span>{{ t('summary.saveFolder') }}</span>
              <RekaSelect
                v-model="saveFolderId"
                :options="noteFolders"
                :placeholder="t('summary.chooseWiseMindFolder')"
              />
            </label>

            <label class="wm-form-field">
              <span>{{ t('summary.noteContent') }}</span>
              <textarea
                v-model="saveMarkdown"
                class="wm-textarea wm-summary-save-content"
                :placeholder="t('summary.noteContentPlaceholder')"
              ></textarea>
            </label>

            <footer class="wm-dialog-actions">
              <button class="wm-button" type="button" @click="closeSaveDialog">{{ t('summary.cancel') }}</button>
              <button
                class="wm-button is-primary"
                type="button"
                :disabled="savingToWiseMind"
                @click="saveToWiseMind"
              >
                {{ savingToWiseMind ? t('summary.saving') : t('summary.save') }}
              </button>
            </footer>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </DialogRoot>
  </section>
</template>
