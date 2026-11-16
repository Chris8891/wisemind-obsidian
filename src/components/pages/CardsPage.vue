<script setup lang="ts">
  import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowPathIcon,
    BookmarkSquareIcon,
    CheckIcon,
    ChevronDownIcon,
    ClipboardDocumentIcon,
    ClockIcon,
    DocumentArrowDownIcon,
    DocumentTextIcon,
    FolderIcon,
    PlusIcon,
    RectangleStackIcon,
    TrashIcon,
    XMarkIcon,
  } from '@heroicons/vue/24/outline';
  import {Notice} from 'obsidian';
  import {
    SelectContent,
    SelectItem,
    SelectItemIndicator,
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
    generateCardsStream,
    type SourceMode,
  } from '../../services/assistantService';
  import {splitCardContent} from '../../services/cardReview';
  import {formatCardsMarkdownBlock} from '../../services/cardsMarkdown';
  import {insertTextToActiveNote} from '../../services/noteWriter';
  import {hasInsertTarget} from '../../services/noteWriter';
  import {upsertPluginTask} from '../../services/pluginTaskProgress';
  import type {AssistantCardDraft, ObsidianSourceItem} from '../../types';
  import ResultNextSteps from '../assistant/ResultNextSteps.vue';
  import AssistantSourceNotes from '../AssistantSourceNotes.vue';
  import NotePickerDialog from '../NotePickerDialog.vue';
  import SourceSelector from '../SourceSelector.vue';
  import StreamingMarkdownView from '../StreamingMarkdownView.vue';
  import WiseMindConnectionDialog from '../WiseMindConnectionDialog.vue';
  import WmDialog from '../WmDialog.vue';
  import WmTooltip from '../WmTooltip.vue';

  const props = defineProps<{
    historyItemId?: string;
    historyToken?: number;
  }>();
  const emit = defineEmits<{
    openHistory: [];
  }>();

  const MAX_CARD_COUNT = 20;

  const plugin = usePlugin();
  const {t} = useI18n();
  const {connectionDialogOpen, ensureWiseMindConnected} = useWiseMindConnectionGuard();
  const sourceMode = ref<SourceMode>('current');
  const pickerOpen = ref(false);
  const selectedNotes = ref<ObsidianSourceItem[]>([]);
  const cards = ref<AssistantCardDraft[]>([]);
  const excludedCards = ref(new Set<AssistantCardDraft>());
  const loading = ref(false);
  const saving = ref(false);
  const error = ref('');
  const controller = ref<AbortController | null>(null);
  const editingIndex = ref<number | null>(null);
  const activeTaskId = ref('');
  const streamingCardsRaw = ref('');
  const cancelNoticeShown = ref(false);
  const alsoInsertToNote = ref(false);
  /** Only cards generated from a single note keep a source, so review can jump back to it. */
  const cardsSourcePath = ref('');
  const resolveSingleSourcePath = (source: {sourcePath?: string; sourcePaths?: string[]}) => {
    const paths = source.sourcePaths?.filter(Boolean) || [];
    if (paths.length > 1) return '';
    const path = paths[0] || source.sourcePath || '';
    return /\.md$/i.test(path) ? path : '';
  };

  // The count picker only offers 1..MAX_CARD_COUNT, so an out-of-range stored value would render blank.
  const cardCount = ref(
    Math.max(1, Math.min(MAX_CARD_COUNT, Math.round(Number(plugin.settings.assistantDefaults.cardCount) || 5))),
  );
  const cardDifficulty = ref(plugin.settings.assistantDefaults.cardDifficulty);
  const cardStructure = ref(plugin.settings.assistantDefaults.cardStructure);
  const deckName = ref(plugin.settings.assistantDefaults.defaultCardDeckName);
  const folderName = ref(plugin.settings.assistantDefaults.defaultCardFolderName);
  const deckId = ref<number | string | null>(null);
  const destinationOpen = ref(false);
  const destinationStep = ref<'deck' | 'folder'>('deck');
  const deckSearch = ref('');
  const folderSearch = ref('');
  const decks = ref<any[]>([]);
  const folders = ref<any[]>([]);
  const loadingDecks = ref(false);
  const loadingFolders = ref(false);

  const itemTitle = (item: any) =>
    String(item?.title || item?.name || item?.label || item?.id || '');
  const itemId = (item: any) => item?.id ?? item?.data?.id;

  const filteredDecks = computed(() => {
    const keyword = deckSearch.value.trim().toLowerCase();
    return decks.value.filter(deck => !keyword || itemTitle(deck).toLowerCase().includes(keyword));
  });

  const filteredFolders = computed(() => {
    const keyword = folderSearch.value.trim().toLowerCase();
    return folders.value.filter(
      folder => !keyword || itemTitle(folder).toLowerCase().includes(keyword),
    );
  });

  // getActiveFile() is not reactive; mirror it so the source chip follows note switches.
  const activeMarkdownPath = () => {
    const file = plugin.app.workspace.getActiveFile();
    return file?.extension === 'md' ? file.path : '';
  };
  const currentNotePath = ref(activeMarkdownPath());
  const refreshCurrentNotePath = () => {
    currentNotePath.value = activeMarkdownPath();
  };
  // True while the connection check and note reading run, before `loading` takes over.
  const preparing = ref(false);
  let prepareSeq = 0;
  /** Why generating is impossible right now; shown as the tooltip of the disabled button. */
  const generateBlockedReason = computed(() => {
    if (sourceMode.value === 'current' && !currentNotePath.value) return t('cards.noOpenNote');
    if (sourceMode.value === 'multi' && !selectedNotes.value.length) return t('cards.noSelectedNotes');
    return '';
  });
  const canGenerate = computed(() => !loading.value && !preparing.value && !generateBlockedReason.value);
  const {flash, isFlashing} = useFlashState();
  const streamEl = ref<HTMLElement | null>(null);
  const streamFollow = useStickToBottom(streamEl);
  const inserting = ref(false);
  const showNextSteps = ref(false);
  const nextStepsVariant = ref<'inserted' | 'saved'>('saved');
  const deckSearchInput = ref<HTMLInputElement | null>(null);
  const folderSearchInput = ref<HTMLInputElement | null>(null);
  const workspaceEventRefs: unknown[] = [];

  const sourceLabel = computed(() => {
    if (sourceMode.value === 'selection') return t('cards.selectedText');
    if (sourceMode.value === 'multi')
      return selectedNotes.value.length
        ? t('cards.selectedNotes', {count: selectedNotes.value.length})
        : t('cards.noSelectedNotes');
    return currentNotePath.value || t('cards.noOpenNote');
  });
  // Note chips already show the path, so the plain label is only needed when no chip is rendered.
  const showSourceLabel = computed(
    () =>
      !(sourceMode.value === 'current' && currentNotePath.value) &&
      !(sourceMode.value === 'multi' && selectedNotes.value.length),
  );

  const removeSelectedNote = (path: string) => {
    selectedNotes.value = selectedNotes.value.filter(note => note.path !== path);
  };

  const difficultyOptions = computed(() => [
    {value: 'basic', label: t('cards.difficultyBasic')},
    {value: 'standard', label: t('cards.difficultyStandard')},
    {value: 'advanced', label: t('cards.difficultyAdvanced')},
  ]);

  const structureOptions = computed(() => [
    {value: 'qa', label: t('cards.cardTypeQa')},
    {value: 'concept', label: t('cards.cardTypeConcept')},
    {value: 'mixed', label: t('cards.cardTypeMixed')},
  ]);

  const countOptions = computed(() =>
    Array.from({length: MAX_CARD_COUNT}, (_, index) => ({
      value: String(index + 1),
      label: t('cards.countOption', {count: index + 1}),
    })),
  );

  const paramPills = computed(() => [
    {
      key: 'count',
      label: t('cards.cardCount'),
      value: String(cardCount.value),
      options: countOptions.value,
      update: (value: string) => {
        cardCount.value = Number(value);
      },
    },
    {
      key: 'difficulty',
      label: t('cards.difficulty'),
      value: cardDifficulty.value,
      options: difficultyOptions.value,
      update: (value: string) => {
        cardDifficulty.value = value as typeof cardDifficulty.value;
      },
    },
    {
      key: 'structure',
      label: t('cards.cardType'),
      value: cardStructure.value,
      options: structureOptions.value,
      update: (value: string) => {
        cardStructure.value = value as typeof cardStructure.value;
      },
    },
  ]);

  const cardTypeLabel = (card: AssistantCardDraft) => {
    const value = card.type || cardStructure.value;
    return (
      structureOptions.value.find(item => item.value === value)?.label ||
      t('cards.cardTypeFallback')
    );
  };

  const cardFace = (card: AssistantCardDraft) => splitCardContent(card.content);

  const isSelected = (card: AssistantCardDraft) => !excludedCards.value.has(card);
  const toggleCard = (card: AssistantCardDraft) => {
    if (excludedCards.value.has(card)) excludedCards.value.delete(card);
    else excludedCards.value.add(card);
  };
  const selectedCards = computed(() => cards.value.filter(card => isSelected(card)));
  const allSelected = computed(() => cards.value.length > 0 && selectedCards.value.length === cards.value.length);
  const toggleAllCards = () => {
    excludedCards.value = allSelected.value ? new Set(cards.value) : new Set();
  };
  const saveBlockedReason = computed(() => (selectedCards.value.length ? '' : t('cards.selectAtLeastOne')));

  const resetCards = (next: AssistantCardDraft[] = []) => {
    cards.value = next;
    excludedCards.value = new Set();
    editingIndex.value = null;
  };

  const syncCardSettings = async () => {
    plugin.settings.assistantDefaults.cardCount = Math.max(
      1,
      Math.min(MAX_CARD_COUNT, Number(cardCount.value || 5)),
    );
    plugin.settings.assistantDefaults.cardDifficulty = cardDifficulty.value;
    plugin.settings.assistantDefaults.cardStructure = cardStructure.value;
    plugin.settings.assistantDefaults.defaultCardDeckName =
      deckName.value.trim() || t('cards.defaultDeckName');
    plugin.settings.assistantDefaults.defaultCardFolderName =
      folderName.value.trim() || t('cards.defaultFolderName');
    await plugin.saveSettings();
  };

  const saveHistory = async (plan: AssistantActionPlan) => {
    plugin.settings.assistantCardHistory.unshift({
      id: `cards-${Date.now()}`,
      createdAt: Date.now(),
      title: plan.sourceTitle,
      sourceTitle: plan.sourceTitle,
      sourcePath: plan.sourcePath,
      sourceKind: plan.sourceKind,
      sourcePaths: plan.sourcePaths,
      cards: cards.value,
    });
    plugin.settings.assistantCardHistory = plugin.settings.assistantCardHistory.slice(0, 50);
    await plugin.saveSettings();
  };

  const notifyCancelled = () => {
    if (cancelNoticeShown.value) return;
    new Notice(t('cards.taskCancelled'));
    cancelNoticeShown.value = true;
  };

  const runGeneration = async (plan: AssistantActionPlan, runningTitle: string) => {
    controller.value?.abort();
    const runController = new AbortController();
    controller.value = runController;
    const taskId = `cards-${Date.now()}`;
    activeTaskId.value = taskId;
    const reportProgress = (completed: number) =>
      upsertPluginTask({
        id: taskId,
        title: runningTitle,
        status: 'running',
        total: Number(cardCount.value || 0),
        completed,
      });
    reportProgress(0);
    streamFollow.reset();
    showNextSteps.value = false;
    loading.value = true;
    cancelNoticeShown.value = false;
    error.value = '';
    streamingCardsRaw.value = '';
    resetCards();
    cardsSourcePath.value = resolveSingleSourcePath(plan);
    try {
      const generatedCards = await generateCardsStream(
        plugin,
        plan,
        {
          onDelta: raw => {
            if (controller.value !== runController) return;
            streamingCardsRaw.value = raw;
          },
          onCards: partialCards => {
            if (controller.value !== runController) return;
            cards.value = partialCards;
            reportProgress(partialCards.length);
          },
        },
        runController.signal,
      );
      if (runController.signal.aborted) throw new Error(t('cards.taskCancelled'));
      if (generatedCards.length) resetCards(generatedCards);
      if (!cards.value.length) throw new Error(t('cards.taskFailed'));
      await saveHistory(plan);
      upsertPluginTask({
        id: taskId,
        title: t('cards.taskGenerated'),
        status: 'completed',
        total: cards.value.length,
        completed: cards.value.length,
      });
    } catch (err: any) {
      if (!runController.signal.aborted) {
        error.value = err?.message || t('cards.taskFailed');
        upsertPluginTask({id: taskId, title: t('cards.taskFailed'), status: 'failed', message: error.value});
      } else {
        upsertPluginTask({id: taskId, title: t('cards.taskCancelled'), status: 'cancelled'});
        if (controller.value === runController || !controller.value) notifyCancelled();
      }
    } finally {
      // A newer run may have replaced this one; only the latest run owns the loading state.
      if (controller.value === runController || !controller.value) {
        loading.value = false;
        controller.value = null;
      }
    }
  };

  const generate = async () => {
    if (!canGenerate.value) return;
    preparing.value = true;
    const seq = prepareSeq;
    let plan: AssistantActionPlan | null = null;
    try {
      if (!(await ensureWiseMindConnected())) return;
      plan = await createAssistantPlan(plugin, 'cards', sourceMode.value, selectedNotes.value);
      if (plan) await syncCardSettings();
    } catch (err: any) {
      error.value = err?.message || t('cards.taskFailed');
      return;
    } finally {
      preparing.value = false;
    }
    // An external action, opened history or unmount while preparing supersedes this run.
    if (!plan || loading.value || seq !== prepareSeq) return;
    await runGeneration(plan, t('cards.taskGenerating'));
  };

  const cancelGenerate = () => {
    controller.value?.abort();
    if (activeTaskId.value) {
      upsertPluginTask({
        id: activeTaskId.value,
        title: t('cards.taskCancelled'),
        status: 'cancelled',
      });
    }
    controller.value = null;
    loading.value = false;
    streamingCardsRaw.value = '';
    notifyCancelled();
  };

  const copyCard = async (card: AssistantCardDraft, index: number) => {
    try {
      await navigator.clipboard.writeText(card.content);
      flash(`copy:${index}`);
    } catch {
      new Notice(t('rewritePreview.copyFailed'));
    }
  };

  const focusCard = async (index: number) => {
    editingIndex.value = index;
    await nextTick();
    document.querySelector<HTMLTextAreaElement>(`[data-card-index="${index}"]`)?.focus();
  };

  const toggleEdit = (index: number) => {
    if (editingIndex.value === index) {
      editingIndex.value = null;
      return;
    }
    void focusCard(index);
  };

  const deleteCard = (index: number) => {
    const removed = cards.value[index];
    if (removed) excludedCards.value.delete(removed);
    cards.value = cards.value.filter((_, currentIndex) => currentIndex !== index);
    if (editingIndex.value === null) return;
    if (editingIndex.value === index) {
      editingIndex.value = null;
      return;
    }
    if (editingIndex.value > index) editingIndex.value -= 1;
  };

  const loadDecks = async () => {
    loadingDecks.value = true;
    try {
      decks.value = await plugin.api.listCardDecks();
    } catch (err: any) {
      new Notice(err?.message || t('cards.loadDecksFailed'));
    } finally {
      loadingDecks.value = false;
    }
  };

  const ensureDeckId = async () => {
    if (deckId.value) return deckId.value;
    const deck: any = await plugin.api.resolveCardDeck(
      deckName.value.trim() || t('cards.defaultDeckName'),
    );
    deckId.value = deck?.id ?? deck?.data?.id;
    return deckId.value;
  };

  const loadFolders = async () => {
    loadingFolders.value = true;
    try {
      const id = await ensureDeckId();
      folders.value = await plugin.api.listCardFolders(id || undefined);
    } catch (err: any) {
      new Notice(err?.message || t('cards.loadFoldersFailed'));
    } finally {
      loadingFolders.value = false;
    }
  };

  // Runs after the dialog's own open auto-focus (close button) so typing goes straight into the search box.
  const focusDestinationSearch = () => {
    window.setTimeout(() => {
      (destinationStep.value === 'deck' ? deckSearchInput : folderSearchInput).value?.focus();
    }, 30);
  };

  const showDestinationStep = async (step: 'deck' | 'folder') => {
    destinationStep.value = step;
    focusDestinationSearch();
    if (step === 'deck') await loadDecks();
    else await loadFolders();
  };

  const openDestination = async () => {
    if (!(await ensureWiseMindConnected())) return;
    destinationOpen.value = true;
    await showDestinationStep('deck');
  };

  const selectDeck = async (deck: any) => {
    deckName.value = itemTitle(deck);
    deckId.value = itemId(deck);
    folderName.value =
      plugin.settings.assistantDefaults.defaultCardFolderName || t('cards.defaultFolderName');
    folders.value = [];
  };

  const pickDeck = async (deck: any) => {
    await selectDeck(deck);
    await showDestinationStep('folder');
  };

  const creatingDestination = ref(false);

  // window.prompt is not available in Obsidian (Electron), so the search box doubles as the name input.
  const createDeck = async () => {
    const title = deckSearch.value.trim();
    if (!title) {
      new Notice(t('cards.promptDeckName'));
      return;
    }
    if (creatingDestination.value) return;
    creatingDestination.value = true;
    try {
      const deck: any = await plugin.api.createCardDeck(title);
      await loadDecks();
      await selectDeck(deck?.data || deck);
      new Notice(t('cards.deckCreated'));
      await showDestinationStep('folder');
    } catch (err: any) {
      new Notice(err?.message || t('cards.loadDecksFailed'));
    } finally {
      creatingDestination.value = false;
    }
  };

  const selectFolder = (folder: any) => {
    folderName.value = itemTitle(folder);
  };

  const createFolder = async () => {
    const title = folderSearch.value.trim();
    if (!title) {
      new Notice(t('cards.promptFolderName'));
      return;
    }
    if (creatingDestination.value) return;
    creatingDestination.value = true;
    try {
      const id = await ensureDeckId();
      if (!id) {
        new Notice(t('cards.chooseDeckFirst'));
        return;
      }
      const folder: any = await plugin.api.createCardFolder(title, id);
      await loadFolders();
      selectFolder(folder?.data || folder);
      destinationOpen.value = false;
      new Notice(t('cards.folderCreated'));
    } catch (err: any) {
      new Notice(err?.message || t('cards.loadFoldersFailed'));
    } finally {
      creatingDestination.value = false;
    }
  };

  const isPlainEnter = (event: KeyboardEvent) =>
    event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229;

  // Enter picks an exact name match, otherwise creates a new item with the typed name.
  const onDeckSearchKeydown = (event: KeyboardEvent) => {
    if (!isPlainEnter(event)) return;
    event.preventDefault();
    const keyword = deckSearch.value.trim().toLowerCase();
    const match = decks.value.find(deck => itemTitle(deck).toLowerCase() === keyword);
    if (match) void pickDeck(match);
    else void createDeck();
  };

  const onFolderSearchKeydown = (event: KeyboardEvent) => {
    if (!isPlainEnter(event)) return;
    event.preventDefault();
    const keyword = folderSearch.value.trim().toLowerCase();
    const match = folders.value.find(folder => itemTitle(folder).toLowerCase() === keyword);
    if (!match) {
      void createFolder();
      return;
    }
    selectFolder(match);
    destinationOpen.value = false;
  };

  const onCardEditorKeydown = (event: KeyboardEvent) => {
    if (event.isComposing) return;
    const confirm = event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey));
    if (!confirm) return;
    event.preventDefault();
    event.stopPropagation();
    const index = editingIndex.value;
    editingIndex.value = null;
    void nextTick(() => document.querySelector<HTMLButtonElement>(`[data-card-row="${index}"]`)?.focus());
  };

  const cardsMarkdownBlock = computed(() => formatCardsMarkdownBlock(selectedCards.value, {
    title: t('markdownInsert.cardsTitle'),
    cardTitle: index => t('markdownInsert.cardTitle', {index}),
    tags: t('markdownInsert.tags'),
  }));

  const insertCardsToCurrentNote = async () => {
    if (!selectedCards.value.length || inserting.value) return;
    const hadTarget = hasInsertTarget(plugin);
    inserting.value = true;
    try {
      await insertTextToActiveNote(plugin, cardsMarkdownBlock.value, t('cards.insertedToNote'));
      if (hadTarget) {
        flash('insert');
        nextStepsVariant.value = 'inserted';
        showNextSteps.value = true;
      }
    } catch (err: any) {
      new Notice(err?.message || t('cards.saveFailed'));
    } finally {
      inserting.value = false;
    }
  };

  const saveToWiseMind = async () => {
    if (!selectedCards.value.length || saving.value) return;
    if (!(await ensureWiseMindConnected())) return;
    saving.value = true;
    try {
      await syncCardSettings();
      const resolvedDeck: any = await plugin.api.resolveCardDeck(
        deckName.value.trim() || t('cards.defaultDeckName'),
      );
      const resolvedDeckId = resolvedDeck?.id ?? resolvedDeck?.data?.id;
      const folder: any = await plugin.api.resolveCardFolder(
        folderName.value.trim() || t('cards.defaultFolderName'),
        resolvedDeckId,
      );
      await plugin.api.createCardsBatch({
        deckId: resolvedDeckId,
        folderId: folder?.id ?? folder?.data?.id,
        cards: selectedCards.value,
        ...(cardsSourcePath.value ? {sourceType: 'obsidian', sourcePath: cardsSourcePath.value} : {}),
      });
      new Notice(t('cards.savedToWiseMind'));
      flash('save');
      nextStepsVariant.value = 'saved';
      showNextSteps.value = true;
      if (alsoInsertToNote.value) await insertCardsToCurrentNote();
    } catch (err: any) {
      new Notice(err?.message || t('cards.saveFailed'));
    } finally {
      saving.value = false;
    }
  };

  const runExternalCardsAction = async (plan: any) => {
    if (plan?.kind !== 'cards') return;
    await runGeneration(plan as AssistantActionPlan, t('cards.taskGeneratingFromSummary'));
  };

  const onExternalAction = (event: Event) => {
    void runExternalCardsAction((event as CustomEvent).detail);
  };

  const openHistoryItem = (id?: string) => {
    if (!id) return;
    const item = plugin.settings.assistantCardHistory.find(history => history.id === id);
    if (!item) return;
    prepareSeq += 1;
    cardsSourcePath.value = resolveSingleSourcePath(item);
    resetCards(
      (item.cards || []).map(card => ({
        content: card.content,
        tags: [...(card.tags || [])],
        type: card.type,
      })),
    );
    streamingCardsRaw.value = '';
    error.value = '';
    loading.value = false;
    controller.value?.abort();
    controller.value = null;
  };

  watch(
    () => props.historyToken,
    () => openHistoryItem(props.historyItemId),
    {immediate: true},
  );

  onMounted(() => {
    window.addEventListener('wisemindai:assistant-action', onExternalAction);
    const workspace = plugin.app.workspace;
    workspaceEventRefs.push(workspace.on('file-open', refreshCurrentNotePath));
    workspaceEventRefs.push(workspace.on('active-leaf-change', refreshCurrentNotePath));
    refreshCurrentNotePath();
  });
  onUnmounted(() => {
    window.removeEventListener('wisemindai:assistant-action', onExternalAction);
    workspaceEventRefs.forEach(ref => plugin.app.workspace.offref(ref));
    workspaceEventRefs.splice(0);
    prepareSeq += 1;
    if (controller.value) {
      cancelNoticeShown.value = true;
      cancelGenerate();
    }
  });
</script>

<template>
  <section class="wm2-cards">
    <div class="wm2-cards-body">
      <section class="wm2-card wm2-cards-source">
        <SourceSelector
          v-model="sourceMode"
          :multi-count="selectedNotes.length"
          @pick-multi="
            pickerOpen = true;
            sourceMode = 'multi';
          "
        />
        <p v-if="showSourceLabel" class="wm2-muted wm2-cards-source-label">
          <DocumentTextIcon class="wm-icon" />
          <span class="wm2-truncate" :title="sourceLabel">{{ t('cards.sourcePreview') }} <strong>{{ sourceLabel }}</strong></span>
        </p>
        <AssistantSourceNotes
          :mode="sourceMode"
          :current-path="currentNotePath"
          :selected-notes="selectedNotes"
          @remove="removeSelectedNote"
        />
      </section>

      <section class="wm2-card wm2-cards-result">
        <header class="wm2-cards-head">
          <BookmarkSquareIcon class="wm-icon wm2-cards-head-icon" />
          <strong class="wm2-truncate wm2-tabular">{{
            cards.length ? t('cards.cardTotal', {count: cards.length}) : t('cards.title')
          }}</strong>
          <WmTooltip
            v-if="cards.length && !loading"
            :content="allSelected ? t('notePicker.clearAll') : t('notePicker.selectAll')"
          >
            <button
              class="wm2-btn is-ghost is-xs wm2-cards-head-meta wm2-tabular"
              type="button"
              :aria-pressed="allSelected"
              @click="toggleAllCards"
            >
              {{ t('cards.selectedCount', {count: selectedCards.length}) }}
            </button>
          </WmTooltip>
          <small v-else-if="cards.length" class="wm2-cards-head-meta wm2-tabular">{{
            t('cards.selectedCount', {count: selectedCards.length})
          }}</small>
        </header>

        <div class="wm2-cards-params">
          <SelectRoot
            v-for="pill in paramPills"
            :key="pill.key"
            :model-value="pill.value"
            @update:model-value="value => pill.update(String(value))"
          >
            <SelectTrigger
              class="wm2-btn is-xs wm2-cards-pill"
              :aria-label="pill.label"
              :title="pill.label"
              :disabled="loading"
            >
              <SelectValue />
              <ChevronDownIcon class="wm-icon wm2-cards-caret" />
            </SelectTrigger>
            <SelectPortal>
              <SelectContent class="wm2-cards-menu" position="popper" :side-offset="4">
                <SelectViewport class="wm2-cards-menu-viewport">
                  <SelectItem
                    v-for="option in pill.options"
                    :key="option.value"
                    class="wm2-cards-menu-item"
                    :value="option.value"
                  >
                    <SelectItemText>{{ option.label }}</SelectItemText>
                    <SelectItemIndicator class="wm2-cards-menu-check">
                      <CheckIcon class="wm-icon" />
                    </SelectItemIndicator>
                  </SelectItem>
                </SelectViewport>
              </SelectContent>
            </SelectPortal>
          </SelectRoot>
          <WmTooltip v-if="cards.length && !loading && generateBlockedReason" :content="generateBlockedReason">
            <span class="wm2-disabled-tip wm2-cards-regenerate" tabindex="0">
              <button class="wm2-btn is-ghost is-xs" type="button" disabled>
                <ArrowPathIcon class="wm-icon" />
                {{ t('summary.regenerate') }}
              </button>
            </span>
          </WmTooltip>
          <button
            v-else-if="cards.length && !loading"
            class="wm2-btn is-ghost is-xs wm2-cards-regenerate"
            type="button"
            :disabled="!canGenerate"
            @click="generate"
          >
            <span v-if="preparing" class="wm2-spinner"></span>
            <ArrowPathIcon v-else class="wm-icon" />
            {{ t('summary.regenerate') }}
          </button>
        </div>

        <div v-if="error" class="wm2-cards-error" role="alert">
          <span>{{ error }}</span>
          <button class="wm2-btn is-ghost is-xs" type="button" :disabled="!canGenerate" @click="generate">
            <ArrowPathIcon class="wm-icon" />
            {{ t('common.retry') }}
          </button>
        </div>

        <div v-if="loading" class="wm2-cards-progress" role="status">
          <span class="wm2-spinner"></span>
          <span class="wm2-truncate">{{ t('cards.generatingCards') }}</span>
          <span class="wm2-cards-progress-count wm2-tabular">{{ cards.length }}/{{ cardCount }}</span>
          <button class="wm2-btn is-ghost is-xs" type="button" @click="cancelGenerate">
            <XMarkIcon class="wm-icon" />
            {{ t('cards.cancelGenerate') }}
          </button>
        </div>

        <div
          v-if="loading && !cards.length && streamingCardsRaw"
          ref="streamEl"
          class="wm2-cards-stream wm2-stream-caret"
        >
          <StreamingMarkdownView :content="streamingCardsRaw" streaming />
        </div>
        <ul v-else-if="loading && !cards.length" class="wm2-cards-list" aria-hidden="true">
          <li v-for="index in 3" :key="index" class="wm2-cards-row wm2-cards-skeleton">
            <span class="wm2-skeleton is-icon"></span>
            <span class="wm2-skeleton-lines">
              <span class="wm2-skeleton"></span>
              <span class="wm2-skeleton is-short"></span>
            </span>
          </li>
        </ul>

        <TransitionGroup v-if="cards.length" tag="ul" name="wm2-item" class="wm2-cards-list">
          <li
            v-for="(card, index) in cards"
            :key="index"
            class="wm2-cards-row"
            :class="{'is-off': !isSelected(card), 'is-editing': editingIndex === index}"
          >
            <div class="wm2-cards-row-head">
              <input
                type="checkbox"
                class="wm2-cards-check"
                :checked="isSelected(card)"
                :disabled="loading"
                :aria-label="cardFace(card).question"
                @change="toggleCard(card)"
              />
              <button
                class="wm2-plain-button wm2-cards-row-main"
                type="button"
                :disabled="loading"
                :aria-expanded="editingIndex === index"
                :title="t('cards.edit')"
                :data-card-row="index"
                @click="toggleEdit(index)"
              >
                <strong class="wm2-clamp-2">{{ cardFace(card).question }}</strong>
                <span v-if="cardFace(card).answer" class="wm2-cards-answer wm2-clamp-2">{{
                  cardFace(card).answer
                }}</span>
              </button>
              <span class="wm2-chip">{{ cardTypeLabel(card) }}</span>
            </div>

            <Transition name="wm2-expand">
            <div v-if="editingIndex === index" class="wm2-cards-editor">
              <textarea
                v-model="card.content"
                rows="5"
                :aria-label="t('cards.edit')"
                :data-card-index="index"
                @keydown="onCardEditorKeydown"
              ></textarea>
              <div class="wm2-cards-editor-foot">
                <div class="wm2-row wm2-chips wm2-cards-tags">
                  <span v-for="tag in card.tags" :key="tag" class="wm2-chip">#{{ tag.replace(/^#/, '') }}</span>
                </div>
                <WmTooltip :content="isFlashing(`copy:${index}`) ? t('shared.copied') : t('cards.copy')">
                  <button
                    class="wm2-icon-btn is-sm wm2-copy-btn"
                    :class="{'is-done': isFlashing(`copy:${index}`)}"
                    type="button"
                    @click="copyCard(card, index)"
                  >
                    <template v-if="isFlashing(`copy:${index}`)">
                      <CheckIcon class="wm-icon" />
                      <span aria-live="polite">{{ t('shared.copied') }}</span>
                    </template>
                    <template v-else>
                      <span class="wm-visually-hidden">{{ t('cards.copy') }}</span>
                      <ClipboardDocumentIcon class="wm-icon" />
                    </template>
                  </button>
                </WmTooltip>
                <WmTooltip :content="t('cards.delete')">
                  <button class="wm2-icon-btn is-sm wm2-cards-danger" type="button" @click="deleteCard(index)">
                    <span class="wm-visually-hidden">{{ t('cards.delete') }}</span>
                    <TrashIcon class="wm-icon" />
                  </button>
                </WmTooltip>
                <button class="wm2-btn is-xs" type="button" @click="editingIndex = null">
                  <CheckIcon class="wm-icon" />
                  {{ t('cards.confirm') }}
                </button>
              </div>
            </div>
            </Transition>
          </li>
        </TransitionGroup>

        <div v-else-if="!loading" class="wm2-empty is-compact wm2-cards-empty">
          <BookmarkSquareIcon class="wm2-empty-icon" />
          <p>{{ t('cards.empty') }}</p>
          <WmTooltip v-if="generateBlockedReason" :content="generateBlockedReason">
            <span class="wm2-disabled-tip" tabindex="0">
              <button class="wm2-btn is-sm is-primary" type="button" disabled>
                <ArrowPathIcon class="wm-icon" />
                {{ t('cards.generate') }}
              </button>
            </span>
          </WmTooltip>
          <button v-else class="wm2-btn is-sm is-primary" type="button" :disabled="!canGenerate" @click="generate">
            <span v-if="preparing" class="wm2-spinner is-on-primary"></span>
            <ArrowPathIcon v-else class="wm-icon" />
            {{ t('cards.generate') }}
          </button>
          <button class="wm2-link-button" type="button" @click="emit('openHistory')">
            <ClockIcon class="wm-icon" />
            {{ t('cards.history') }}
          </button>
        </div>
      </section>

      <section v-if="cards.length" class="wm2-section">
        <h4 class="wm2-section-title">{{ t('syncPage.saveTo') }}</h4>
        <button
          class="wm2-btn is-sm is-block wm2-cards-destination"
          type="button"
          :aria-label="t('cards.deckDialogTitle')"
          :title="`${deckName || t('cards.chooseDeck')} / ${folderName || t('cards.chooseFolder')}`"
          @click="openDestination"
        >
          <BookmarkSquareIcon class="wm-icon wm2-cards-head-icon" />
          <span class="wm2-truncate">{{ deckName || t('cards.chooseDeck') }}</span>
          <span class="wm2-cards-sep">/</span>
          <span class="wm2-truncate">{{ folderName || t('cards.chooseFolder') }}</span>
          <ChevronDownIcon class="wm-icon wm2-cards-caret" />
        </button>
        <label class="wm2-cards-option">
          <input v-model="alsoInsertToNote" type="checkbox" class="wm2-cards-check" />
          <span>{{ t('cards.alsoInsertNote') }}</span>
        </label>
      </section>
    </div>

    <ResultNextSteps
      v-if="showNextSteps && cards.length && !loading"
      kind="cards"
      :source-path="cardsSourcePath"
      :success-text="
        nextStepsVariant === 'inserted' ? t('resultNextSteps.cardsInserted') : t('resultNextSteps.cardsSaved')
      "
      :success-desc="
        nextStepsVariant === 'inserted'
          ? t('resultNextSteps.cardsInsertedDesc')
          : t('resultNextSteps.cardsSavedDesc')
      "
    />

    <footer v-if="cards.length" class="wm2-cards-footer">
      <span class="wm2-cards-footer-hint wm2-truncate">{{
        cardsSourcePath ? t('cards.backlinkHint') : ''
      }}</span>
      <WmTooltip
        :content="saveBlockedReason || (isFlashing('insert') ? t('shared.inserted') : t('cards.insertCurrentNote'))"
      >
        <span class="wm2-disabled-tip" :tabindex="saveBlockedReason ? 0 : undefined">
          <button
            class="wm2-icon-btn wm2-copy-btn"
            :class="{'is-done': isFlashing('insert')}"
            type="button"
            :disabled="!!saveBlockedReason || inserting"
            @click="insertCardsToCurrentNote"
          >
            <span class="wm-visually-hidden">{{ t('cards.insertCurrentNote') }}</span>
            <span v-if="inserting" class="wm2-spinner"></span>
            <CheckIcon v-else-if="isFlashing('insert')" class="wm-icon" />
            <DocumentArrowDownIcon v-else class="wm-icon" />
          </button>
        </span>
      </WmTooltip>
      <WmTooltip v-if="saveBlockedReason" :content="saveBlockedReason">
        <span class="wm2-disabled-tip" tabindex="0">
          <button class="wm2-btn is-sm is-primary wm2-tabular" type="button" disabled>
            <CheckIcon class="wm-icon" />
            {{ t('cards.saveCount', {count: 0}) }}
          </button>
        </span>
      </WmTooltip>
      <button
        v-else
        class="wm2-btn is-sm is-primary wm2-tabular"
        :class="{'is-done': isFlashing('save')}"
        type="button"
        :disabled="loading || saving"
        @click="saveToWiseMind"
      >
        <span v-if="saving" class="wm2-spinner is-on-primary"></span>
        <CheckIcon v-else class="wm-icon" />
        <span aria-live="polite">{{
          saving
            ? t('summary.saving')
            : isFlashing('save')
              ? t('shared.saved')
              : t('cards.saveCount', {count: selectedCards.length})
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

    <WmDialog
      v-model:open="destinationOpen"
      :title="destinationStep === 'deck' ? t('cards.deckDialogTitle') : t('cards.folderDialogTitle')"
      content-class="wm2-cards-dialog"
    >
      <div class="wm2-segmented wm2-cards-steps">
        <button
          type="button"
          :class="{'is-active': destinationStep === 'deck'}"
          :aria-pressed="destinationStep === 'deck'"
          @click="showDestinationStep('deck')"
        >
          <RectangleStackIcon class="wm-icon" />{{ t('cards.deck') }}
        </button>
        <button
          type="button"
          :class="{'is-active': destinationStep === 'folder'}"
          :aria-pressed="destinationStep === 'folder'"
          @click="showDestinationStep('folder')"
        >
          <FolderIcon class="wm-icon" />{{ t('cards.folder') }}
        </button>
      </div>

      <template v-if="destinationStep === 'deck'">
        <div class="wm2-cards-dialog-toolbar">
          <input
            ref="deckSearchInput"
            v-model="deckSearch"
            class="wm2-cards-input"
            :aria-label="t('cards.deckSearchPlaceholder')"
            :placeholder="t('cards.deckSearchPlaceholder')"
            @keydown="onDeckSearchKeydown"
          />
          <button class="wm2-btn is-sm" type="button" :disabled="creatingDestination" @click="createDeck">
            <span v-if="creatingDestination" class="wm2-spinner"></span>
            <PlusIcon v-else class="wm-icon" />
            {{ t('cards.newDeck') }}
          </button>
        </div>
        <div class="wm2-cards-dialog-list">
          <div v-if="loadingDecks" class="wm2-cards-dialog-loading"><span class="wm2-spinner"></span></div>
          <label
            v-for="deck in filteredDecks"
            :key="itemId(deck) || itemTitle(deck)"
            class="wm2-cards-radio"
            :class="{'is-active': itemTitle(deck) === deckName}"
          >
            <input
              type="radio"
              name="wm2-cards-deck"
              :checked="itemTitle(deck) === deckName"
              @click="pickDeck(deck)"
            />
            <BookmarkSquareIcon class="wm-icon" />
            <span class="wm2-truncate" :title="itemTitle(deck)">{{ itemTitle(deck) }}</span>
            <CheckIcon v-if="itemTitle(deck) === deckName" class="wm-icon wm2-cards-radio-check" />
          </label>
          <p v-if="!loadingDecks && !filteredDecks.length" class="wm2-muted wm2-cards-dialog-empty">{{
            t('cards.noDecks')
          }}</p>
        </div>
      </template>

      <template v-else>
        <div class="wm2-cards-dialog-toolbar">
          <input
            ref="folderSearchInput"
            v-model="folderSearch"
            class="wm2-cards-input"
            :aria-label="t('cards.folderSearchPlaceholder')"
            :placeholder="t('cards.folderSearchPlaceholder')"
            @keydown="onFolderSearchKeydown"
          />
          <button class="wm2-btn is-sm" type="button" :disabled="creatingDestination" @click="createFolder">
            <span v-if="creatingDestination" class="wm2-spinner"></span>
            <PlusIcon v-else class="wm-icon" />
            {{ t('cards.newFolder') }}
          </button>
        </div>
        <div class="wm2-cards-dialog-list">
          <div v-if="loadingFolders" class="wm2-cards-dialog-loading"><span class="wm2-spinner"></span></div>
          <label
            v-for="folder in filteredFolders"
            :key="itemId(folder) || itemTitle(folder)"
            class="wm2-cards-radio"
            :class="{'is-active': itemTitle(folder) === folderName}"
          >
            <input
              type="radio"
              name="wm2-cards-folder"
              :checked="itemTitle(folder) === folderName"
              @change="selectFolder(folder)"
            />
            <DocumentTextIcon class="wm-icon" />
            <span class="wm2-truncate" :title="itemTitle(folder)">{{ itemTitle(folder) }}</span>
            <CheckIcon v-if="itemTitle(folder) === folderName" class="wm-icon wm2-cards-radio-check" />
          </label>
          <p v-if="!loadingFolders && !filteredFolders.length" class="wm2-muted wm2-cards-dialog-empty">{{
            t('cards.noFolders')
          }}</p>
        </div>
      </template>

      <footer class="wm2-dialog-actions">
        <button class="wm2-btn is-sm" type="button" @click="destinationOpen = false">
          <XMarkIcon class="wm-icon" />
          {{ t('cards.cancel') }}
        </button>
        <button class="wm2-btn is-sm is-primary" type="button" @click="destinationOpen = false">
          <CheckIcon class="wm-icon" />
          {{ t('cards.confirm') }}
        </button>
      </footer>
    </WmDialog>
  </section>
</template>
