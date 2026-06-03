<script setup lang="ts">
  import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowPathIcon,
    BookmarkSquareIcon,
    CheckCircleIcon,
    ClipboardDocumentIcon,
    ClockIcon,
    DocumentTextIcon,
    PencilSquareIcon,
    PlusIcon,
    TrashIcon,
  } from '@heroicons/vue/24/outline';
  import {Notice} from 'obsidian';
  import {
    NumberFieldDecrement,
    NumberFieldIncrement,
    NumberFieldInput,
    NumberFieldRoot,
  } from 'reka-ui';

  import {usePlugin} from '../../composables/usePlugin';
  import {useWiseMindConnectionGuard} from '../../composables/useWiseMindConnectionGuard';
  import {
    createAssistantPlan,
    generateCards,
    type SourceMode,
  } from '../../services/assistantService';
  import {formatCardsMarkdownBlock} from '../../services/cardsMarkdown';
  import {insertTextToActiveNote} from '../../services/noteWriter';
  import {upsertPluginTask} from '../../services/pluginTaskProgress';
  import type {AssistantCardDraft, ObsidianSourceItem} from '../../types';
  import AssistantSourceNotes from '../AssistantSourceNotes.vue';
  import NotePickerDialog from '../NotePickerDialog.vue';
  import RekaSelect from '../RekaSelect.vue';
  import SourceSelector from '../SourceSelector.vue';
  import WiseMindConnectionDialog from '../WiseMindConnectionDialog.vue';
  import WmTooltip from '../WmTooltip.vue';

  const props = defineProps<{
    historyItemId?: string;
    historyToken?: number;
  }>();
  const emit = defineEmits<{
    openHistory: [];
  }>();

  const plugin = usePlugin();
  const {t} = useI18n();
  const {connectionDialogOpen, ensureWiseMindConnected} = useWiseMindConnectionGuard();
  const sourceMode = ref<SourceMode>('current');
  const pickerOpen = ref(false);
  const selectedNotes = ref<ObsidianSourceItem[]>([]);
  const cards = ref<AssistantCardDraft[]>([]);
  const loading = ref(false);
  const error = ref('');
  const controller = ref<AbortController | null>(null);
  const editingIndex = ref<number | null>(null);
  const activeTaskId = ref('');

  const cardCount = ref(plugin.settings.assistantDefaults.cardCount);
  const cardDifficulty = ref(plugin.settings.assistantDefaults.cardDifficulty);
  const cardStructure = ref(plugin.settings.assistantDefaults.cardStructure);
  const deckName = ref(plugin.settings.assistantDefaults.defaultCardDeckName);
  const folderName = ref(plugin.settings.assistantDefaults.defaultCardFolderName);
  const deckId = ref<number | string | null>(null);
  const deckPickerOpen = ref(false);
  const folderPickerOpen = ref(false);
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

  const sourceLabel = computed(() => {
    if (sourceMode.value === 'selection') return t('cards.selectedText');
    if (sourceMode.value === 'multi')
      return selectedNotes.value.length
        ? t('cards.selectedNotes', {count: selectedNotes.value.length})
        : t('cards.noSelectedNotes');
    return plugin.app.workspace.getActiveFile()?.path || t('cards.noOpenNote');
  });
  const currentNotePath = computed(() => plugin.app.workspace.getActiveFile()?.path || '');

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

  const cardTypeLabel = (card: AssistantCardDraft) => {
    const value = card.type || cardStructure.value;
    return (
      structureOptions.value.find(item => item.value === value)?.label ||
      t('cards.cardTypeFallback')
    );
  };

  const syncCardSettings = async () => {
    plugin.settings.assistantDefaults.cardCount = Math.max(
      1,
      Math.min(20, Number(cardCount.value || 5)),
    );
    plugin.settings.assistantDefaults.cardDifficulty = cardDifficulty.value;
    plugin.settings.assistantDefaults.cardStructure = cardStructure.value;
    plugin.settings.assistantDefaults.defaultCardDeckName =
      deckName.value.trim() || t('cards.defaultDeckName');
    plugin.settings.assistantDefaults.defaultCardFolderName =
      folderName.value.trim() || t('cards.defaultFolderName');
    await plugin.saveSettings();
  };

  const generate = async () => {
    if (!(await ensureWiseMindConnected())) return;
    const plan = await createAssistantPlan(plugin, 'cards', sourceMode.value, selectedNotes.value);
    if (!plan) return;
    controller.value?.abort();
    controller.value = new AbortController();
    const taskId = `cards-${Date.now()}`;
    activeTaskId.value = taskId;
    upsertPluginTask({
      id: taskId,
      title: t('cards.taskGenerating'),
      status: 'running',
      total: Number(cardCount.value || 0),
      completed: 0,
    });
    await syncCardSettings();
    loading.value = true;
    error.value = '';
    editingIndex.value = null;
    try {
      cards.value = await generateCards(plugin, plan, controller.value.signal);
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
      upsertPluginTask({
        id: taskId,
        title: t('cards.taskGenerated'),
        status: 'completed',
        total: cards.value.length,
        completed: cards.value.length,
      });
    } catch (err: any) {
      if (!controller.value?.signal.aborted) {
        error.value = err?.message || t('cards.taskFailed');
        upsertPluginTask({
          id: taskId,
          title: t('cards.taskFailed'),
          status: 'failed',
          message: error.value,
        });
      } else {
        upsertPluginTask({
          id: taskId,
          title: t('cards.taskCancelled'),
          status: 'cancelled',
        });
      }
    } finally {
      loading.value = false;
      controller.value = null;
    }
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
  };

  const copyCard = async (card: AssistantCardDraft) => {
    await globalThis.navigator?.clipboard?.writeText(card.content);
    new Notice(t('cards.copied'));
  };

  const focusCard = async (index: number) => {
    editingIndex.value = index;
    await nextTick();
    document.querySelector<HTMLTextAreaElement>(`[data-card-index="${index}"]`)?.focus();
  };

  const deleteCard = (index: number) => {
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

  const openDeckPicker = async () => {
    deckPickerOpen.value = true;
    await loadDecks();
  };

  const selectDeck = async (deck: any) => {
    deckName.value = itemTitle(deck);
    deckId.value = itemId(deck);
    folderName.value =
      plugin.settings.assistantDefaults.defaultCardFolderName || t('cards.defaultFolderName');
    folders.value = [];
  };

  const createDeck = async () => {
    const title = deckSearch.value.trim() || window.prompt(t('cards.promptDeckName'))?.trim();
    if (!title) return;
    const deck: any = await plugin.api.createCardDeck(title);
    await loadDecks();
    await selectDeck(deck?.data || deck);
    deckPickerOpen.value = false;
    new Notice(t('cards.deckCreated'));
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

  const openFolderPicker = async () => {
    folderPickerOpen.value = true;
    await loadFolders();
  };

  const selectFolder = (folder: any) => {
    folderName.value = itemTitle(folder);
  };

  const createFolder = async () => {
    const title = folderSearch.value.trim() || window.prompt(t('cards.promptFolderName'))?.trim();
    if (!title) return;
    const id = await ensureDeckId();
    if (!id) {
      new Notice(t('cards.chooseDeckFirst'));
      return;
    }
    const folder: any = await plugin.api.createCardFolder(title, id);
    await loadFolders();
    selectFolder(folder?.data || folder);
    folderPickerOpen.value = false;
    new Notice(t('cards.folderCreated'));
  };

  const saveToWiseMind = async () => {
    if (!cards.value.length) return;
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
      cards: cards.value,
    });
    new Notice(t('cards.savedToWiseMind'));
  };

  const cardsMarkdownBlock = computed(() => formatCardsMarkdownBlock(cards.value));

  const insertCardsToCurrentNote = async () => {
    if (!cards.value.length) return;
    await insertTextToActiveNote(plugin, cardsMarkdownBlock.value, t('cards.insertedToNote'));
  };

  const runExternalCardsAction = async (plan: any) => {
    if (plan?.kind !== 'cards') return;
    controller.value?.abort();
    controller.value = new AbortController();
    const taskId = `cards-${Date.now()}`;
    activeTaskId.value = taskId;
    upsertPluginTask({
      id: taskId,
      title: t('cards.taskGeneratingFromSummary'),
      status: 'running',
      total: Number(cardCount.value || 0),
      completed: 0,
    });
    loading.value = true;
    error.value = '';
    editingIndex.value = null;
    try {
      cards.value = await generateCards(plugin, plan, controller.value.signal);
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
      upsertPluginTask({
        id: taskId,
        title: t('cards.taskGenerated'),
        status: 'completed',
        total: cards.value.length,
        completed: cards.value.length,
      });
    } catch (err: any) {
      if (!controller.value?.signal.aborted) {
        error.value = err?.message || t('cards.taskFailed');
        upsertPluginTask({
          id: taskId,
          title: t('cards.taskFailed'),
          status: 'failed',
          message: error.value,
        });
      }
    } finally {
      loading.value = false;
      controller.value = null;
    }
  };

  const onExternalAction = (event: Event) => {
    void runExternalCardsAction((event as CustomEvent).detail);
  };

  const openHistoryItem = (id?: string) => {
    if (!id) return;
    const item = plugin.settings.assistantCardHistory.find(history => history.id === id);
    if (!item) return;
    cards.value = (item.cards || []).map(card => ({
      content: card.content,
      tags: [...(card.tags || [])],
      type: card.type,
    }));
    error.value = '';
    loading.value = false;
    editingIndex.value = null;
    controller.value?.abort();
    controller.value = null;
  };

  watch(
    () => props.historyToken,
    () => openHistoryItem(props.historyItemId),
    {immediate: true},
  );

  onMounted(() => window.addEventListener('wisemindai:assistant-action', onExternalAction));
  onUnmounted(() => window.removeEventListener('wisemindai:assistant-action', onExternalAction));
</script>

<template>
  <section class="wm-page">
    <header class="wm-page-header">
      <div class="wm-title-line">
        <BookmarkSquareIcon class="wm-title-icon" />
        <h2>{{ t('cards.title') }}</h2>
      </div>
      <div class="wm-toolbar">
        <WmTooltip :content="t('cards.history')">
          <button class="wm-icon-button" type="button" @click="emit('openHistory')">
            <ClockIcon class="wm-icon" />
          </button>
        </WmTooltip>
      </div>
    </header>

    <div class="wm-cards-layout">
      <aside class="wm-panel wm-card-config-panel">
        <div class="wm-panel-title">
          <BookmarkSquareIcon class="wm-panel-title-icon" />
          <div class="wm-section-title">{{ t('cards.sourceSection') }}</div>
        </div>
        <div class="wm-card-source-stack">
          <SourceSelector
            v-model="sourceMode"
            :multi-count="selectedNotes.length"
            @pick-multi="
              pickerOpen = true;
              sourceMode = 'multi';
            "
          />
        </div>
        <p class="wm-source-preview"
          >{{ t('cards.sourcePreview') }} <strong>{{ sourceLabel }}</strong></p
        >
        <AssistantSourceNotes
          :mode="sourceMode"
          :current-path="currentNotePath"
          :selected-notes="selectedNotes"
          @remove="removeSelectedNote"
        />

        <div class="wm-panel-title">
          <ArrowPathIcon class="wm-panel-title-icon" />
          <div class="wm-section-title">{{ t('cards.generationSection') }}</div>
        </div>
        <label class="wm-field-row">
          <span>{{ t('cards.cardCount') }}</span>
          <NumberFieldRoot v-model="cardCount" class="wm-stepper" :min="1" :max="20">
            <NumberFieldDecrement type="button">-</NumberFieldDecrement>
            <NumberFieldInput />
            <NumberFieldIncrement type="button">+</NumberFieldIncrement>
          </NumberFieldRoot>
        </label>
        <label class="wm-field-row">
          <span>{{ t('cards.difficulty') }}</span>
          <RekaSelect v-model="cardDifficulty" :options="difficultyOptions" />
        </label>
        <label class="wm-field-row">
          <span>{{ t('cards.cardType') }}</span>
          <RekaSelect v-model="cardStructure" :options="structureOptions" />
        </label>

        <div class="wm-panel-title">
          <CheckCircleIcon class="wm-panel-title-icon" />
          <div class="wm-section-title">{{ t('cards.destinationSection') }}</div>
        </div>
        <label class="wm-field-row">
          <span>{{ t('cards.deck') }}</span>
          <button class="wm-select-trigger" type="button" @click="openDeckPicker">
            <span>{{ deckName || t('cards.chooseDeck') }}</span>
            <BookmarkSquareIcon class="wm-icon" />
          </button>
        </label>
        <label class="wm-field-row">
          <span>{{ t('cards.folder') }}</span>
          <button class="wm-select-trigger" type="button" @click="openFolderPicker">
            <span>{{ folderName || t('cards.chooseFolder') }}</span>
            <BookmarkSquareIcon class="wm-icon" />
          </button>
        </label>

        <footer class="wm-actions wm-card-generate-actions">
          <button v-if="loading" class="wm-button" type="button" @click="cancelGenerate">{{
            t('cards.cancelGenerate')
          }}</button>
          <button class="wm-button is-primary" type="button" :disabled="loading" @click="generate">
            <span v-if="loading" class="wm-loading-spinner"></span>
            <ArrowPathIcon v-else class="wm-icon" />
            {{ loading ? t('cards.generating') : t('cards.generate') }}
          </button>
        </footer>
      </aside>

      <section class="wm-panel wm-card-preview-panel">
        <div class="wm-panel-title wm-card-preview-title">
          <div class="wm-panel-title">
            <BookmarkSquareIcon class="wm-panel-title-icon" />
            <div class="wm-section-title">{{
              t('cards.preview', {count: cards.length || cardCount})
            }}</div>
          </div>
          <button
            v-if="cards.length"
            class="wm-button is-primary"
            type="button"
            @click="saveToWiseMind"
          >
            <CheckCircleIcon class="wm-icon" />
            {{ t('cards.saveToWiseMind') }}
          </button>
          <button
            v-if="cards.length"
            class="wm-button"
            type="button"
            @click="insertCardsToCurrentNote"
          >
            <DocumentTextIcon class="wm-icon" />
            {{ t('cards.insertCurrentNote') }}
          </button>
        </div>

        <div v-if="error" class="wm-alert is-error">{{ error }}</div>

        <div
          v-if="loading && !cards.length"
          class="wm:grid wm:min-h-[180px] wm:place-items-center wm:gap-2 wm:text-center wm:text-[var(--text-muted)]"
        >
          <div class="wm:flex wm:gap-2 wm:items-center">
            <span class="wm-loading-spinner"></span>
            <strong>{{ t('cards.generatingCards') }}</strong>
          </div>
        </div>

        <div v-else-if="cards.length" class="wm:grid wm:min-w-0 wm:gap-2.5">
          <article v-for="(card, index) in cards" :key="index" class="wm-generated-card">
            <header class="wm-generated-card-header">
              <span class="wm-card-index">{{ index + 1 }}</span>
              <strong>{{ cardTypeLabel(card) }}</strong>
              <div class="wm:flex wm:gap-1.5">
                <WmTooltip :content="t('cards.edit')">
                  <button class="wm-icon-button" type="button" @click="focusCard(index)">
                    <PencilSquareIcon class="wm-icon" />
                  </button>
                </WmTooltip>
                <WmTooltip :content="t('cards.copy')">
                  <button class="wm-icon-button" type="button" @click="copyCard(card)">
                    <ClipboardDocumentIcon class="wm-icon" />
                  </button>
                </WmTooltip>
                <WmTooltip :content="t('cards.delete')">
                  <button class="wm-icon-button" type="button" @click="deleteCard(index)">
                    <TrashIcon class="wm-icon" />
                  </button>
                </WmTooltip>
              </div>
            </header>
            <textarea
              v-model="card.content"
              class="wm-card-content"
              :class="{'is-editing': editingIndex === index}"
              :data-card-index="index"
              :readonly="editingIndex !== index"
              @blur="editingIndex = null"
            ></textarea>
            <div class="wm-card-tags">
              <span v-for="tag in card.tags" :key="tag">#{{ tag.replace(/^#/, '') }}</span>
            </div>
          </article>
        </div>

        <div
          v-else
          class="wm:grid wm:min-h-[180px] wm:place-items-center wm:gap-2 wm:text-center wm:text-[var(--text-muted)]"
          >{{ t('cards.empty') }}</div
        >
      </section>
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

    <div
      v-if="deckPickerOpen"
      class="modal modal-open full-modal"
      @click.self="deckPickerOpen = false"
    >
      <section
        class="modal-box relative wm-card-picker-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="t('cards.deckDialogTitle')"
      >
        <button
          class="btn btn-sm btn-circle btn-ghost absolute right-4 top-4"
          type="button"
          @click="deckPickerOpen = false"
          >✕</button
        >
        <h3 class="wm-dialog-title">{{ t('cards.deckDialogTitle') }}</h3>
        <div class="wm-card-picker-toolbar">
          <input
            v-model="deckSearch"
            class="wm-input"
            :placeholder="t('cards.deckSearchPlaceholder')"
          />
          <button class="wm-button" type="button" @click="createDeck">
            <PlusIcon class="wm-icon" /> {{ t('cards.newDeck') }}
          </button>
        </div>
        <div class="wm-card-picker-list">
          <label
            v-for="deck in filteredDecks"
            :key="itemId(deck) || itemTitle(deck)"
            class="wm-picker-radio-row"
          >
            <input
              type="radio"
              name="wm-card-deck"
              :checked="itemTitle(deck) === deckName"
              @change="selectDeck(deck)"
            />
            <span>{{ itemTitle(deck) }}</span>
          </label>
          <div v-if="!loadingDecks && !filteredDecks.length" class="wm-sync-empty">{{
            t('cards.noDecks')
          }}</div>
        </div>
        <footer class="wm-dialog-actions">
          <button class="wm-button" type="button" @click="deckPickerOpen = false">{{
            t('cards.cancel')
          }}</button>
          <button class="wm-button is-primary" type="button" @click="deckPickerOpen = false">{{
            t('cards.confirm')
          }}</button>
        </footer>
      </section>
    </div>

    <div
      v-if="folderPickerOpen"
      class="modal modal-open full-modal"
      @click.self="folderPickerOpen = false"
    >
      <section
        class="modal-box relative wm-card-picker-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="t('cards.folderDialogTitle')"
      >
        <button
          class="btn btn-sm btn-circle btn-ghost absolute right-4 top-4"
          type="button"
          @click="folderPickerOpen = false"
          >✕</button
        >
        <h3 class="wm-dialog-title">{{ t('cards.folderDialogTitle') }}</h3>
        <div class="wm-card-picker-toolbar">
          <input
            v-model="folderSearch"
            class="wm-input"
            :placeholder="t('cards.folderSearchPlaceholder')"
          />
          <button class="wm-button" type="button" @click="createFolder">
            <PlusIcon class="wm-icon" /> {{ t('cards.newFolder') }}
          </button>
        </div>
        <div class="wm-card-picker-list">
          <label
            v-for="folder in filteredFolders"
            :key="itemId(folder) || itemTitle(folder)"
            class="wm-picker-radio-row"
          >
            <input
              type="radio"
              name="wm-card-folder"
              :checked="itemTitle(folder) === folderName"
              @change="selectFolder(folder)"
            />
            <span>{{ itemTitle(folder) }}</span>
          </label>
          <div v-if="!loadingFolders && !filteredFolders.length" class="wm-sync-empty">{{
            t('cards.noFolders')
          }}</div>
        </div>
        <footer class="wm-dialog-actions">
          <button class="wm-button" type="button" @click="folderPickerOpen = false">{{
            t('cards.cancel')
          }}</button>
          <button class="wm-button is-primary" type="button" @click="folderPickerOpen = false">{{
            t('cards.confirm')
          }}</button>
        </footer>
      </section>
    </div>
  </section>
</template>
