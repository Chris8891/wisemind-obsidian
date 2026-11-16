import {Notice, type TFile} from 'obsidian';

import type WiseMindObsidianPlugin from '../main';
import {stripSourceMarkers} from '../markers';
import {isMembershipLimitError} from '../wisemindApi';

let quizInFlight = false;

/** The quiz is generated and answered in WiseMindAI; Obsidian only sends the content. */
export const createQuizFromNote = async (plugin: WiseMindObsidianPlugin, file: TFile | null, selectedText = '') => {
  if (quizInFlight) {
    new Notice(plugin.t('quiz.busy'));
    return;
  }
  const content = selectedText.trim() || (file && file.extension === 'md' ? stripSourceMarkers(await plugin.app.vault.cachedRead(file)).trim() : '');
  if (!content) {
    new Notice(plugin.t('obsidianMessages.noProcessableContent'));
    return;
  }
  quizInFlight = true;
  const progress = new Notice(plugin.t('quiz.generating'), 0);
  try {
    const result = await plugin.api.createQuiz({content, title: file?.basename || plugin.t('quiz.untitled')});
    const paperId = result?.paperId;
    if (paperId === undefined || paperId === null || paperId === '') throw new Error(plugin.t('quiz.failed'));
    plugin.reminders.notify(plugin.t('quiz.ready'), plugin.t('quiz.answer'), () => {
      void plugin.api.openSource({type: 'quiz', id: paperId}).catch(error => {
        new Notice((error as Error)?.message || plugin.t('searchPage.openWiseMindFailed'));
      });
    });
  } catch (error) {
    if (isMembershipLimitError(error)) {
      plugin.reminders.notify(plugin.t('quiz.limit'), plugin.t('capability.upgrade'), () => void plugin.api.openClientSetting('subscribe'));
    } else {
      new Notice((error as Error)?.message || plugin.t('quiz.failed'));
    }
  } finally {
    quizInFlight = false;
    progress.hide();
  }
};
