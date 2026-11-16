import {ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {Notice} from 'obsidian';

import {useFlashState} from '../../../composables/useFlashState';
import {usePlugin} from '../../../composables/usePlugin';
import {ensureFolder, nextAvailablePath} from '../../../obsidianWriter';
import {type ChatInsertFormat, formatChatMessageForInsert} from '../../../services/chatInsertFormat';
import {hasInsertTarget, insertTextToActiveNote} from '../../../services/noteWriter';
import {queueAssistantAction} from '../../../services/panelStore';
import {quoteYamlString, sanitizeFileName} from '../../../text';

import type {ChatMessage} from './types';
import {useOpenNote} from './useChatContext';

const INSERT_FORMAT: ChatInsertFormat = 'markdown';

/** Per-message actions: copy, insert into the active note, save as a new note and make cards. */
export const useChatMessageActions = (options: {
  sessionTitle: () => string | undefined;
  referenceTitle: (path: string) => string;
}) => {
  const {sessionTitle, referenceTitle} = options;
  const plugin = usePlugin();
  const {t} = useI18n();
  const openNote = useOpenNote();
  const {flash, isFlashing} = useFlashState();
  const savingNoteId = ref('');

  const titleOrDefault = () => sessionTitle()?.trim() || t('chat.defaultTitle');

  const copyMessage = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      flash(`copy:${message.id}`);
    } catch {
      new Notice(t('rewritePreview.copyFailed'));
    }
  };

  const insertMessage = async (message: ChatMessage) => {
    const hadTarget = hasInsertTarget(plugin);
    try {
      await insertTextToActiveNote(
        plugin,
        formatChatMessageForInsert(message.content, INSERT_FORMAT, {
          title: t('markdownInsert.chatTitle'),
        }),
        t('chat.inserted'),
      );
      if (hadTarget) flash(`insert:${message.id}`);
    } catch (err: any) {
      new Notice(err?.message || t('chat.failed'));
    }
  };

  const writeMessageNote = async (message: ChatMessage) => {
    const fallbackTitle = t('chat.defaultTitle');
    const title = titleOrDefault();
    const folder = (plugin.settings.defaultObsidianRootFolder ?? 'WiseMindAI').replace(
      /^\/+|\/+$/g,
      '',
    );
    const sources = (message.referencePaths || []).map(path => `[[${referenceTitle(path)}]]`);
    const frontmatter = sources.length
      ? `---\nsource:\n${sources.map(link => `  - ${quoteYamlString(link)}`).join('\n')}\n---\n\n`
      : '';
    try {
      if (folder) await ensureFolder(plugin.app, folder);
      const filename = sanitizeFileName(title, fallbackTitle);
      const path = await nextAvailablePath(
        plugin.app,
        folder ? `${folder}/${filename}.md` : `${filename}.md`,
      );
      await plugin.app.vault.create(path, `${frontmatter}# ${title}\n\n${message.content.trim()}\n`);
      new Notice(t('chat.noteSaved', {path}));
      void openNote(path);
    } catch (err: any) {
      new Notice(err?.message || t('chat.failed'));
    }
  };

  const saveMessageAsNote = async (message: ChatMessage) => {
    if (savingNoteId.value) return;
    savingNoteId.value = message.id;
    try {
      await writeMessageNote(message);
    } finally {
      savingNoteId.value = '';
    }
  };

  const makeCards = (message: ChatMessage) => {
    const content = message.content.trim();
    if (!content) return;
    queueAssistantAction({
      kind: 'cards',
      sourceKind: 'selection',
      sourceTitle: t('assistantActions.selectionExcerpt', {title: titleOrDefault()}),
      sourcePath: message.referencePaths?.[0] || '',
      content,
    });
  };

  return {
    savingNoteId,
    isFlashing,
    copyMessage,
    insertMessage,
    saveMessageAsNote,
    makeCards,
  };
};
