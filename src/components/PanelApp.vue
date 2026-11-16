<script setup lang="ts">
  import {
    computed,
    defineAsyncComponent,
    onMounted,
    onUnmounted,
    provide,
    reactive,
    ref,
    watch,
  } from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    AcademicCapIcon,
    ArrowPathIcon,
    ChatBubbleOvalLeftEllipsisIcon,
    ClockIcon,
    DocumentTextIcon,
    EllipsisHorizontalIcon,
    MagnifyingGlassIcon,
    XMarkIcon,
  } from '@heroicons/vue/24/outline';
  import {Menu, openExternal} from 'obsidian';
  import {TabsIndicator, TabsList, TabsRoot, TabsTrigger, TooltipProvider} from 'reka-ui';

  import type WiseMindObsidianPlugin from '../main';
  import {
    WISEMIND_OPEN_CONNECTION_DIALOG_EVENT,
    WISEMIND_OPEN_SETTINGS_EVENT,
  } from '../services/connectionDialog';
  import {
    closeOverlay,
    openAssistantView,
    openBackgroundTasks,
    openHistorySelection,
    openPanelTab,
    openTranscriptionOverlay,
    panelState,
    type PanelTab,
    setOnboardingOpen,
  } from '../services/panelStore';
  import {pluginKey} from '../services/pluginContext';
  import {runningPluginTask} from '../services/pluginTaskProgress';
  import type {TaskHistoryEntry, TaskHistoryType} from '../services/taskHistory';

  import AskTab from './assistant/AskTab.vue';
  import AssistantTab from './assistant/AssistantTab.vue';
  import SyncPage from './pages/SyncPage.vue';
  import ReviewTab from './review/ReviewTab.vue';
  import BackgroundTasksSheet from './shell/BackgroundTasksSheet.vue';
  import CapabilityBanner from './shell/CapabilityBanner.vue';
  import OnboardingCard from './shell/OnboardingCard.vue';
  import WmLogo from './shell/WmLogo.vue';
  import TaskHistoryDialog from './TaskHistoryDialog.vue';
  import WiseMindConnectionDialog from './WiseMindConnectionDialog.vue';
  import WmTooltip from './WmTooltip.vue';

  // Load the heavier transcription overlay only after the user opens it.
  const TranscriptionPage = defineAsyncComponent(() => import('./pages/TranscriptionPage.vue'));

  const props = defineProps<{
    plugin: WiseMindObsidianPlugin;
  }>();

  provide(pluginKey, props.plugin);
  const {t} = useI18n();

  const tabs = [
    {key: 'note' as const, labelKey: 'shell.tabs.note', icon: DocumentTextIcon},
    {key: 'ask' as const, labelKey: 'shell.tabs.ask', icon: ChatBubbleOvalLeftEllipsisIcon},
    {key: 'review' as const, labelKey: 'shell.tabs.review', icon: AcademicCapIcon},
    {key: 'sync' as const, labelKey: 'shell.tabs.sync', icon: ArrowPathIcon},
  ];

  // Tabs mount on first visit and then stay alive, so switching back is instant.
  const visited = reactive<Record<PanelTab, boolean>>({
    note: false,
    ask: false,
    review: false,
    sync: false,
  });
  const transcriptionVisited = ref(false);
  watch(
    () => panelState.tab,
    tab => {
      visited[tab] = true;
    },
    {immediate: true},
  );
  watch(
    () => panelState.overlay,
    overlay => {
      if (overlay === 'transcription') transcriptionVisited.value = true;
    },
  );

  const activeTab = computed({
    get: () => panelState.tab,
    set: (value: PanelTab) => openPanelTab(value),
  });

  const showTranscription = computed(() => panelState.overlay === 'transcription');
  const hideTaskBanner = computed(
    () =>
      !showTranscription.value &&
      activeTab.value === 'note' &&
      (panelState.noteView === 'summary' || panelState.noteView === 'cards'),
  );

  const historyDefaultType = ref<TaskHistoryType>('all');
  const connectionDialogOpen = ref(false);
  const checkingConnection = ref(false);
  if (!props.plugin.settings.hasSeenTutorial) setOnboardingOpen(true);
  const showOnboarding = computed(() => panelState.onboardingOpen);

  const connectionStatus = computed(() =>
    checkingConnection.value ? 'checking' : panelState.connected ? 'connected' : 'disconnected',
  );
  const dueBadge = computed(() => (panelState.dueCount > 99 ? '99+' : String(panelState.dueCount)));
  const syncConflictCount = computed(() => props.plugin.syncEngine?.state.conflicts.length || 0);
  const syncBadge = computed(() =>
    syncConflictCount.value > 99 ? '99+' : syncConflictCount.value > 0 ? String(syncConflictCount.value) : '',
  );

  const retryConnection = async () => {
    if (checkingConnection.value) return;
    checkingConnection.value = true;
    const ok = await props.plugin.testConnection();
    checkingConnection.value = false;
    if (!ok) connectionDialogOpen.value = true;
  };

  const openHistoryDialog = (type: TaskHistoryType = 'all') => {
    historyDefaultType.value = type;
    panelState.historyDialogOpen = true;
  };

  const openHistoryTask = (task: TaskHistoryEntry) => {
    panelState.historyDialogOpen = false;
    openHistorySelection({type: task.type, id: task.id});
  };

  const openWebsite = () => void openExternal('https://wisemindai.app');

  const moreMenuOpen = ref(false);

  // Anchored under the button (not at the pointer) so keyboard activation opens it in the right place too.
  const openMoreMenu = (event: MouseEvent) => {
    const anchor = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
    const menu = new Menu() as Menu & {onHide?: (callback: () => void) => unknown};
    menu
      .addItem(item =>
        item.setTitle(t('shell.openSettings')).setIcon('settings').onClick(() => props.plugin.openSettings()),
      )
      .addItem(item =>
        item.setTitle(t('shell.openBackgroundTasks')).setIcon('list-checks').onClick(() => openBackgroundTasks()),
      )
      .addItem(item =>
        item.setTitle(t('shell.openGuide')).setIcon('help-circle').onClick(() => {
          setOnboardingOpen(true);
        }),
      )
      .addItem(item =>
        item.setTitle(t('shell.openFeedback')).setIcon('message-square').onClick(() => {
          void openExternal('https://wisemindai.app/feedback');
        }),
      )
      .addItem(item => item.setTitle(t('shell.openWebsite')).setIcon('globe').onClick(openWebsite));
    menu.onHide?.(() => {
      moreMenuOpen.value = false;
    });
    if (anchor) menu.showAtPosition({x: anchor.left, y: anchor.bottom + 4});
    else menu.showAtMouseEvent(event);
    moreMenuOpen.value = Boolean(menu.onHide);
  };

  const finishOnboarding = async () => {
    setOnboardingOpen(false);
    await props.plugin.markTutorialSeen();
  };

  const summarizeCurrentNote = () => void props.plugin.runAssistantAction('summary');

  const openConnectionDialog = () => {
    connectionDialogOpen.value = true;
  };

  const openSettings = () => props.plugin.openSettings();

  const openExternalPage = (event: Event) => {
    const page = String((event as CustomEvent)?.detail || '');
    if (page === 'transcription') openTranscriptionOverlay();
    else if (page === 'sync' || page === 'review' || page === 'note' || page === 'ask') openPanelTab(page);
    else if (page === 'assistant') openPanelTab('note');
    else if (page === 'summary' || page === 'cards' || page === 'chat') openAssistantView(page);
    else if (page === 'home') openAssistantView('workbench');
    else if (page === 'search') props.plugin.openSearch();
    else if (page === 'settings') openSettings();
    else if (page === 'background-tasks') openBackgroundTasks();
  };

  // Esc closes the recording overlay when no dialog owns the key event.
  const onShellKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented || !showTranscription.value) return;
    if (panelState.backgroundTasksOpen || panelState.historyDialogOpen || connectionDialogOpen.value) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
    event.preventDefault();
    closeOverlay();
  };

  onMounted(() => {
    window.addEventListener(WISEMIND_OPEN_CONNECTION_DIALOG_EVENT, openConnectionDialog);
    window.addEventListener(WISEMIND_OPEN_SETTINGS_EVENT, openSettings);
    window.addEventListener('wisemindai:open-page', openExternalPage);
    window.addEventListener('keydown', onShellKeydown);
    void props.plugin.refreshDueCount();
  });

  onUnmounted(() => {
    window.removeEventListener(WISEMIND_OPEN_CONNECTION_DIALOG_EVENT, openConnectionDialog);
    window.removeEventListener(WISEMIND_OPEN_SETTINGS_EVENT, openSettings);
    window.removeEventListener('wisemindai:open-page', openExternalPage);
    window.removeEventListener('keydown', onShellKeydown);
  });
</script>

<template>
  <TooltipProvider :delay-duration="250" :skip-delay-duration="120">
    <div class="wm2-shell" :class="{'is-overlay': showTranscription}">
      <Transition name="wm2-header-swap" mode="out-in">
        <header v-if="showTranscription" key="overlay-header" class="wm2-header wm2-header-overlay">
          <WmTooltip :content="panelState.connected ? t('shell.connected') : t('shell.disconnected')" side="bottom">
            <button class="wm2-brand" type="button" @click="retryConnection">
              <span class="wm-visually-hidden">{{
                panelState.connected ? t('shell.connected') : t('shell.disconnected')
              }}</span>
              <WmLogo :status="connectionStatus" />
            </button>
          </WmTooltip>
          <strong class="wm2-overlay-title wm2-truncate">{{ t('shell.overlay.transcription') }}</strong>
          <div class="wm2-header-actions">
            <WmTooltip :content="t('shell.closeOverlay')" side="bottom">
              <button class="wm2-icon-btn" type="button" @click="closeOverlay">
                <span class="wm-visually-hidden">{{ t('shell.closeOverlay') }}</span>
                <XMarkIcon class="wm-icon" />
              </button>
            </WmTooltip>
          </div>
        </header>
        <TabsRoot v-else key="tabs-header" v-model="activeTab" class="wm2-header" activation-mode="manual">
          <WmTooltip :content="panelState.connected ? t('shell.connected') : t('shell.disconnected')" side="bottom">
            <button class="wm2-brand" type="button" @click="retryConnection">
              <span class="wm-visually-hidden">{{
                panelState.connected ? t('shell.connected') : t('shell.disconnected')
              }}</span>
              <WmLogo :status="connectionStatus" />
            </button>
          </WmTooltip>
          <TabsList class="wm2-tabs" :aria-label="'WiseMindAI'">
            <TabsIndicator class="wm2-tab-indicator" />
            <TabsTrigger
              v-for="tab in tabs"
              :key="tab.key"
              class="wm2-tab"
              :class="{'is-active': activeTab === tab.key}"
              :value="tab.key"
              :title="t(tab.labelKey)"
            >
              <component :is="tab.icon" class="wm-icon" />
              <span class="wm2-tab-label">{{ t(tab.labelKey) }}</span>
              <span
                v-if="tab.key === 'review' && panelState.dueCount > 0"
                class="wm2-badge"
                :aria-label="t('shell.dueBadge', {count: panelState.dueCount})"
              >{{ dueBadge }}</span>
              <span
                v-else-if="tab.key === 'sync' && syncBadge"
                class="wm2-badge is-warning"
                :aria-label="t('shell.conflictBadge', {count: syncConflictCount})"
              >{{ syncBadge }}</span>
            </TabsTrigger>
          </TabsList>
          <div class="wm2-header-actions">
            <WmTooltip :content="t('shell.search')" side="bottom">
              <button class="wm2-icon-btn" type="button" @click="plugin.openSearch()">
                <span class="wm-visually-hidden">{{ t('shell.search') }}</span>
                <MagnifyingGlassIcon class="wm-icon" />
              </button>
            </WmTooltip>
            <WmTooltip :content="t('shell.history')" side="bottom">
              <button
                class="wm2-icon-btn"
                :class="{'is-open': panelState.historyDialogOpen}"
                type="button"
                aria-haspopup="dialog"
                :aria-expanded="panelState.historyDialogOpen"
                @click="openHistoryDialog()"
              >
                <span class="wm-visually-hidden">{{ t('shell.history') }}</span>
                <ClockIcon class="wm-icon" />
              </button>
            </WmTooltip>
            <WmTooltip :content="t('shell.more')" side="bottom">
              <button
                class="wm2-icon-btn"
                :class="{'is-open': moreMenuOpen}"
                type="button"
                aria-haspopup="menu"
                :aria-expanded="moreMenuOpen"
                @click="openMoreMenu"
              >
                <span class="wm-visually-hidden">{{ t('shell.more') }}</span>
                <EllipsisHorizontalIcon class="wm-icon" />
              </button>
            </WmTooltip>
          </div>
        </TabsRoot>
      </Transition>

      <main class="wm2-main">
        <Transition name="wm2-collapse">
          <OnboardingCard v-if="showOnboarding && !showTranscription" @done="finishOnboarding" @summarize="summarizeCurrentNote" />
        </Transition>
        <CapabilityBanner v-if="!showTranscription" />
        <Transition name="wm2-collapse">
          <div
            v-if="runningPluginTask && !hideTaskBanner && !showTranscription"
            class="wm2-task-banner"
            role="status"
          >
            <button class="wm2-task-banner-btn" type="button" @click="openBackgroundTasks">
              <span class="wm2-spinner"></span>
              <span class="wm2-truncate">
                {{ runningPluginTask.title }}
                <template v-if="runningPluginTask.total">
                  ({{ runningPluginTask.completed || 0 }}/{{ runningPluginTask.total }})
                </template>
              </span>
            </button>
          </div>
        </Transition>

        <!-- Keep tabs mounted under the overlay so summary/chat streams survive recording. -->
        <div v-show="!showTranscription" class="wm2-tabs-stack">
          <section v-if="visited.note" v-show="activeTab === 'note'" class="wm2-tab-panel">
            <AssistantTab @open-history="openHistoryDialog" />
          </section>
          <section v-if="visited.ask" v-show="activeTab === 'ask'" class="wm2-tab-panel">
            <AskTab />
          </section>
          <section v-if="visited.review" v-show="activeTab === 'review'" class="wm2-tab-panel">
            <ReviewTab />
          </section>
          <section v-if="visited.sync" v-show="activeTab === 'sync'" class="wm2-tab-panel wm-tab-content">
            <SyncPage
              :history-item-id="panelState.history?.type === 'sync' ? panelState.history.id : ''"
              :history-token="panelState.history?.type === 'sync' ? panelState.history.token : 0"
              @open-history="openHistoryDialog('sync')"
            />
          </section>
        </div>
        <Transition name="wm2-view">
          <section
            v-if="showTranscription && transcriptionVisited"
            key="transcription"
            data-value="transcription"
            class="wm2-tab-panel wm-tab-content wm-transcription-tab-content"
          >
            <TranscriptionPage />
          </section>
        </Transition>
      </main>

      <TaskHistoryDialog
        v-model:default-type="historyDefaultType"
        :open="panelState.historyDialogOpen"
        @close="panelState.historyDialogOpen = false"
        @select="openHistoryTask"
      />
      <BackgroundTasksSheet />
      <WiseMindConnectionDialog v-model:open="connectionDialogOpen" />
    </div>
  </TooltipProvider>
</template>
