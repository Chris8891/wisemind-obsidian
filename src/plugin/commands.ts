import {Notice} from 'obsidian';

import {FEATURES} from '../features';
import type WiseMindObsidianPlugin from '../main';
import {hasFeature} from '../services/capabilities';
import type {EditorRewriteAction} from '../services/editorRewriteActions';
import {openAssistantView, openPanelTab, requestReviewStart} from '../services/panelStore';

const REWRITE_ACTIONS: EditorRewriteAction[] = ['polish', 'rewrite', 'expand', 'shorten', 'tags'];

/** No default hotkeys are assigned, as required by the Obsidian plugin guidelines. */
export const registerCommands = (plugin: WiseMindObsidianPlugin) => {
  const t = plugin.t.bind(plugin);
  const hasSelection = () => Boolean(plugin.getActiveEditorSelection().trim());
  const selectionCommand = (run: () => unknown) => (checking: boolean) => {
    if (!hasSelection()) return false;
    if (!checking) void run();
    return true;
  };

  plugin.addCommand({id: 'open-panel', name: t('commands.openPanel'), callback: () => void plugin.activateView()});
  plugin.addCommand({id: 'search', name: t('commandsV2.search'), callback: () => plugin.openSearch()});
  plugin.addCommand({
    id: 'open-review',
    name: t('commandsV2.openReview'),
    callback: async () => {
      openPanelTab('review');
      await plugin.activateView();
    },
  });
  plugin.addCommand({
    id: 'start-review',
    name: t('commandsV2.startReview'),
    callback: async () => {
      requestReviewStart();
      await plugin.activateView();
    },
  });
  plugin.addCommand({
    id: 'open-chat',
    name: t('commandsV2.openChat'),
    callback: async () => {
      openAssistantView('chat');
      await plugin.activateView();
    },
  });
  plugin.addCommand({
    id: 'open-sync',
    name: t('commandsV2.openSync'),
    callback: async () => {
      openPanelTab('sync');
      await plugin.activateView();
    },
  });
  plugin.addCommand({
    id: 'open-transcription',
    name: t('commands.openTranscription'),
    callback: () => void plugin.openTranscriptionPage(),
  });
  plugin.addCommand({
    id: 'send-current-note',
    name: t('commandsV2.sendToWiseMind'),
    callback: () => void plugin.sendActions.sendActiveNote(),
  });
  plugin.addCommand({
    id: 'send-current-folder',
    name: t('commands.sendCurrentFolder'),
    callback: () => void plugin.sendActions.sendActiveFolder(),
  });
  plugin.addCommand({
    id: 'summarize-current-note',
    name: t('commands.summarizeCurrentNote'),
    callback: () => void plugin.runAssistantAction('summary'),
  });
  plugin.addCommand({
    id: 'generate-cards-current-note',
    name: t('commands.cardsCurrentNote'),
    callback: () => void plugin.runAssistantAction('cards'),
  });
  plugin.addCommand({
    id: 'summarize-selected-text',
    name: t('commands.summarizeSelectedText'),
    checkCallback: selectionCommand(() => plugin.runAssistantAction('summary', plugin.getActiveEditorSelection())),
  });
  plugin.addCommand({
    id: 'generate-cards-selected-text',
    name: t('commands.cardsSelectedText'),
    checkCallback: selectionCommand(() => plugin.runAssistantAction('cards', plugin.getActiveEditorSelection())),
  });
  plugin.addCommand({
    id: 'ask-selected-text',
    name: t('commandsV2.askSelection'),
    checkCallback: selectionCommand(() => plugin.askAboutSelection()),
  });
  plugin.addCommand({
    id: 'translate-selected-text',
    name: t('commandsV2.translateSelection'),
    checkCallback: selectionCommand(() => plugin.runEditorRewriteAction('translate')),
  });
  REWRITE_ACTIONS.forEach(action => {
    plugin.addCommand({
      id: `rewrite-selected-text-${action}`,
      name: t('commands.rewriteSelected', {action: t(`editorRewrite.${action}`)}),
      checkCallback: selectionCommand(() => plugin.runEditorRewriteAction(action)),
    });
  });
  plugin.addCommand({
    id: 'quiz-current-note',
    name: t('commandsV2.quizCurrentNote'),
    checkCallback: checking => {
      const file = plugin.app.workspace.getActiveFile();
      if (!hasFeature(FEATURES.quiz) || file?.extension !== 'md') return false;
      if (!checking) void plugin.createQuiz(file, plugin.getActiveEditorSelection());
      return true;
    },
  });
  plugin.addCommand({
    id: 'ai-task',
    name: t('commandsV2.aiTask'),
    checkCallback: checking => {
      if (!hasFeature(FEATURES.taskPlan)) return false;
      if (!checking) void plugin.openAiTask();
      return true;
    },
  });
  plugin.addCommand({
    id: 'sync-now',
    name: t('commandsV2.syncNow'),
    checkCallback: checking => {
      if (!plugin.settings.syncRules.some(rule => rule.enabled) || plugin.syncEngine.running) return false;
      if (!checking) void plugin.syncEngine.sync();
      return true;
    },
  });
  plugin.addCommand({
    id: 'cancel-sync',
    name: t('commandsV2.cancelSync'),
    checkCallback: checking => {
      if (!plugin.syncEngine.running) return false;
      if (!checking) plugin.syncEngine.cancel();
      return true;
    },
  });
  plugin.addCommand({
    id: 'connect-ai',
    name: t('commandsV2.connectAi'),
    callback: () => void plugin.openAiSettings(),
  });
  plugin.addCommand({
    id: 'test-connection',
    name: t('commands.testConnection'),
    callback: async () => {
      const ok = await plugin.testConnection();
      new Notice(t(ok ? 'common.connected' : 'common.disconnected'));
    },
  });
};
