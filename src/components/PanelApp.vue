<script setup lang="ts">
  import {nextTick, onMounted, onUnmounted, provide, ref} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowPathIcon,
    BookmarkSquareIcon,
    ChatBubbleOvalLeftEllipsisIcon,
    Cog6ToothIcon,
    DocumentTextIcon,
    GlobeAltIcon,
    HomeIcon,
    MagnifyingGlassIcon,
    QuestionMarkCircleIcon,
  } from '@heroicons/vue/24/outline';
  import {openExternal} from 'obsidian';
  import {TabsContent, TabsList, TabsRoot, TabsTrigger, TooltipProvider} from 'reka-ui';

  import wiseMindLogoIcon from '../assets/icons/wisemindai-logo.svg?raw';
  import type WiseMindObsidianPlugin from '../main';
  import {
    WISEMIND_OPEN_CONNECTION_DIALOG_EVENT,
    WISEMIND_OPEN_SETTINGS_EVENT,
  } from '../services/connectionDialog';
  import {pluginKey} from '../services/pluginContext';
  import {runningPluginTask} from '../services/pluginTaskProgress';
  import {
    type TaskHistoryEntry,
    type TaskHistoryType,
    taskTargetPage,
  } from '../services/taskHistory';

  import AssistantHome from './pages/AssistantHome.vue';
  import CardsPage from './pages/CardsPage.vue';
  import ChatPage from './pages/ChatPage.vue';
  import SearchPage from './pages/SearchPage.vue';
  import SettingsPage from './pages/SettingsPage.vue';
  import SummaryPage from './pages/SummaryPage.vue';
  import SyncPage from './pages/SyncPage.vue';
  import TutorialPage from './pages/TutorialPage.vue';
  import TaskHistoryDialog from './TaskHistoryDialog.vue';
  import WiseMindConnectionDialog from './WiseMindConnectionDialog.vue';
  import WmTooltip from './WmTooltip.vue';

  const props = defineProps<{
    plugin: WiseMindObsidianPlugin;
  }>();

  provide(pluginKey, props.plugin);
  const {t} = useI18n();

  type PageKey = 'home' | 'summary' | 'cards' | 'chat' | 'sync' | 'search' | 'settings' | 'tutorial';

  const activePage = ref<PageKey>('home');
  const historyDialogOpen = ref(false);
  const connectionDialogOpen = ref(false);
  const historyDefaultType = ref<TaskHistoryType>('all');
  const selectedHistory = ref<{type: TaskHistoryEntry['type']; id: string; token: number} | null>(
    null,
  );
  const summaryResetToken = ref(0);
  const searchDraft = ref({keyword: '', token: 0});
  const chatDraft = ref({message: '', token: 0, autoSend: false, newSession: false});
  const primaryNavItems = [
    {key: 'home' as const, labelKey: 'nav.home', icon: HomeIcon},
    {key: 'summary' as const, labelKey: 'nav.summary', icon: DocumentTextIcon},
    {key: 'cards' as const, labelKey: 'nav.cards', icon: BookmarkSquareIcon},
    {key: 'chat' as const, labelKey: 'nav.chat', icon: ChatBubbleOvalLeftEllipsisIcon},
    {key: 'sync' as const, labelKey: 'nav.sync', icon: ArrowPathIcon},
    {key: 'search' as const, labelKey: 'nav.search', icon: MagnifyingGlassIcon},
  ];
  const footerNavItems = [{key: 'settings' as const, labelKey: 'nav.settings', icon: Cog6ToothIcon}];

  const openHistoryDialog = (type: TaskHistoryType) => {
    historyDefaultType.value = type;
    historyDialogOpen.value = true;
  };

  const openPage = (page: PageKey) => {
    activePage.value = page;
  };

  const openHistoryTask = (task: TaskHistoryEntry) => {
    historyDialogOpen.value = false;
    activePage.value = taskTargetPage(task.type) as PageKey;
    selectedHistory.value = {
      type: task.type,
      id: task.id,
      token: Date.now(),
    };
  };

  const openChatWithMessage = (message: string, autoSend = false, newSession = false) => {
    activePage.value = 'chat';
    selectedHistory.value = null;
    chatDraft.value = {message, token: Date.now(), autoSend, newSession};
  };

  const clearChatDraft = (token: number) => {
    if (chatDraft.value.token !== token) return;
    chatDraft.value = {message: '', token: 0, autoSend: false, newSession: false};
  };

  const openCardsWithSummary = async (payload: {
    title: string;
    sourcePath?: string;
    markdown: string;
  }) => {
    activePage.value = 'cards';
    selectedHistory.value = null;
    await nextTick();
    window.dispatchEvent(new CustomEvent('wisemindai:assistant-action', {
      detail: {
        kind: 'cards',
        sourceKind: 'selection',
        sourceTitle: t('assistant.summaryCards', {title: payload.title || t('assistant.summary')}),
        sourcePath: payload.sourcePath || '',
        content: payload.markdown,
      },
    }));
  };

  const summarizeCurrentNote = async () => {
    activePage.value = 'summary';
    selectedHistory.value = null;
    summaryResetToken.value = Date.now();
    await nextTick();
    void props.plugin.runAssistantAction('summary');
  };

  const searchCurrentNote = async (keyword: string) => {
    activePage.value = 'search';
    selectedHistory.value = null;
    searchDraft.value = {keyword, token: Date.now()};
  };

  const openConnectionDialog = () => {
    connectionDialogOpen.value = true;
  };

  const openSettingsPage = () => {
    activePage.value = 'settings';
  };

  const openOfficialWebsite = () => {
    const url = 'https://wisemindai.app';
    if (typeof openExternal === 'function') {
      void openExternal(url).catch(() => {
        window.open(url, '_blank', 'noopener,noreferrer');
      });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  onMounted(() => {
    window.addEventListener(WISEMIND_OPEN_CONNECTION_DIALOG_EVENT, openConnectionDialog);
    window.addEventListener(WISEMIND_OPEN_SETTINGS_EVENT, openSettingsPage);
  });

  onUnmounted(() => {
    window.removeEventListener(WISEMIND_OPEN_CONNECTION_DIALOG_EVENT, openConnectionDialog);
    window.removeEventListener(WISEMIND_OPEN_SETTINGS_EVENT, openSettingsPage);
  });
</script>

<template>
  <TooltipProvider :delay-duration="250" :skip-delay-duration="120">
    <TabsRoot v-model="activePage" class="wm-shell" orientation="vertical">
      <TabsList class="wm-nav" aria-label="WiseMindAI">
        <div class="wm-nav-main">
          <WmTooltip :content="t('nav.home')" side="right">
            <TabsTrigger class="wm-nav-item wm-nav-logo" value="home">
              <span class="wm-logo-mark" v-html="wiseMindLogoIcon"></span>
              <span>{{ t('nav.home') }}</span>
            </TabsTrigger>
          </WmTooltip>
          <WmTooltip
            v-for="item in primaryNavItems.slice(1)"
            :key="item.key"
            :content="t(item.labelKey)"
            side="right"
          >
            <TabsTrigger class="wm-nav-item" :value="item.key" @click="openPage(item.key)">
              <component :is="item.icon" class="wm-icon" />
              <span>{{ t(item.labelKey) }}</span>
            </TabsTrigger>
          </WmTooltip>
        </div>

        <div class="wm-nav-footer">
          <WmTooltip
            v-for="item in footerNavItems"
            :key="item.key"
            :content="t(item.labelKey)"
            side="right"
          >
            <TabsTrigger class="wm-nav-item" :value="item.key">
              <component :is="item.icon" class="wm-icon" />
              <span>{{ t(item.labelKey) }}</span>
            </TabsTrigger>
          </WmTooltip>
          <WmTooltip :content="t('nav.tutorial')" side="right">
            <button class="wm-nav-item" type="button" @click="activePage = 'tutorial'">
              <QuestionMarkCircleIcon class="wm-icon" />
              <span>{{ t('nav.tutorial') }}</span>
            </button>
          </WmTooltip>
          <WmTooltip :content="t('nav.openWebsite')" side="right">
            <button class="wm-nav-item" type="button" @click="openOfficialWebsite">
              <GlobeAltIcon class="wm-icon" />
              <span>{{ t('nav.website') }}</span>
            </button>
          </WmTooltip>
        </div>
      </TabsList>

      <main class="wm-main">
        <div
          v-if="runningPluginTask && activePage !== 'summary' && activePage !== 'cards'"
          class="alert alert-info rounded-none py-2"
        >
          <span class="loading loading-spinner loading-sm"></span>
          <span class="truncate">
            {{ runningPluginTask.title }}
            <template v-if="runningPluginTask.total">
              （{{ runningPluginTask.completed || 0 }}/{{ runningPluginTask.total }}）
            </template>
          </span>
        </div>
        <TabsContent value="home" class="wm-tab-content">
          <AssistantHome
            @open="openPage($event)"
            @open-chat="openChatWithMessage"
            @summarize-current="summarizeCurrentNote"
            @search-current="searchCurrentNote"
            @open-history="openHistoryDialog"
            @open-task="openHistoryTask"
            @open-settings="openSettingsPage"
          />
        </TabsContent>
        <TabsContent value="summary" class="wm-tab-content">
          <SummaryPage
            :history-item-id="selectedHistory?.type === 'summary' ? selectedHistory.id : ''"
            :history-token="selectedHistory?.type === 'summary' ? selectedHistory.token : 0"
            :reset-token="summaryResetToken"
            @open-history="openHistoryDialog('summary')"
            @open-chat="openChatWithMessage"
            @open-cards="openCardsWithSummary"
            @open-sync="activePage = 'sync'"
          />
        </TabsContent>
        <TabsContent value="cards" class="wm-tab-content">
          <CardsPage
            :history-item-id="selectedHistory?.type === 'cards' ? selectedHistory.id : ''"
            :history-token="selectedHistory?.type === 'cards' ? selectedHistory.token : 0"
            @open-history="openHistoryDialog('cards')"
          />
        </TabsContent>
        <TabsContent value="chat" class="wm-tab-content wm-chat-tab-content">
          <ChatPage
            :history-item-id="selectedHistory?.type === 'chat' ? selectedHistory.id : ''"
            :history-token="selectedHistory?.type === 'chat' ? selectedHistory.token : 0"
            :draft-message="chatDraft.message"
            :draft-token="chatDraft.token"
            :draft-auto-send="chatDraft.autoSend"
            :draft-new-session="chatDraft.newSession"
            @draft-consumed="clearChatDraft"
          />
        </TabsContent>
        <TabsContent value="sync" class="wm-tab-content">
          <SyncPage
            :history-item-id="selectedHistory?.type === 'sync' ? selectedHistory.id : ''"
            :history-token="selectedHistory?.type === 'sync' ? selectedHistory.token : 0"
            @open-history="openHistoryDialog('sync')"
          />
        </TabsContent>
        <TabsContent value="search" class="wm-tab-content">
          <SearchPage
            :draft-keyword="searchDraft.keyword"
            :draft-token="searchDraft.token"
            @open-chat="openChatWithMessage"
            @open-sync="activePage = 'sync'"
          />
        </TabsContent>
        <TabsContent value="settings" class="wm-tab-content">
          <SettingsPage />
        </TabsContent>
        <TabsContent value="tutorial" class="wm-tab-content">
          <TutorialPage @done="activePage = 'home'" />
        </TabsContent>
      </main>

      <TaskHistoryDialog
        v-model:default-type="historyDefaultType"
        :open="historyDialogOpen"
        @close="historyDialogOpen = false"
        @select="openHistoryTask"
      />
      <WiseMindConnectionDialog v-model:open="connectionDialogOpen" />
    </TabsRoot>
  </TooltipProvider>
</template>
