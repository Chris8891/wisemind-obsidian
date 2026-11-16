import {type Editor, MarkdownView, Notice} from 'obsidian';

import {resolveLanguageSetting} from '../i18n';
import type WiseMindObsidianPlugin from '../main';
import {locateRewriteTarget, RewritePreviewModal, type RewriteTarget} from '../modals/rewritePreviewModal';
import {type EditorRewriteAction, extractRewriteText, formatRewriteResult} from '../services/editorRewriteActions';

const activeEditor = (plugin: WiseMindObsidianPlugin): Editor | null =>
  plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor || plugin.app.workspace.activeEditor?.editor || null;

export const getSelectionTarget = (plugin: WiseMindObsidianPlugin): RewriteTarget | null => {
  const editor = activeEditor(plugin);
  if (!editor) return null;
  const from = editor.getCursor('from');
  const to = editor.getCursor('to');
  const text = editor.getRange(from, to);
  if (!text.trim()) return null;
  return {editor, file: plugin.app.workspace.getActiveFile(), from, to, text};
};

const rewriteLabels = (plugin: WiseMindObsidianPlugin) => ({
  rewrite: plugin.t('editorRewrite.rewrite'),
  expand: plugin.t('editorRewrite.expand'),
  shorten: plugin.t('editorRewrite.shorten'),
  polish: plugin.t('editorRewrite.polish'),
  tags: plugin.t('editorRewrite.tags'),
  translate: plugin.t('editorRewrite.translate'),
});

// A second run would still find the original text and append a duplicate callout.
let rewriteInFlight = false;

/** Without preview the result is appended below the original as a callout, never replacing it. */
const rewriteWithoutPreview = async (
  plugin: WiseMindObsidianPlugin,
  action: EditorRewriteAction,
  target: RewriteTarget,
) => {
  if (rewriteInFlight) return;
  rewriteInFlight = true;
  const label = plugin.t(`editorRewrite.${action}`);
  const progress = new Notice(plugin.t('obsidianMessages.rewriting', {action: label}), 0);
  try {
    const response = await plugin.api.rewriteText({
      text: target.text,
      action,
      language: resolveLanguageSetting(plugin.settings.assistantDefaults.language),
    });
    const rewritten = extractRewriteText(response);
    if (!rewritten) {
      new Notice(plugin.t('obsidianMessages.noInsertContent'));
      return;
    }
    const range = locateRewriteTarget(plugin.app, target);
    if (!range) {
      new Notice(plugin.t('rewritePreview.selectionChanged'));
      return;
    }
    target.editor.transaction({
      changes: [{...range, text: formatRewriteResult(action, target.text, rewritten, rewriteLabels(plugin))}],
    });
    new Notice(plugin.t('obsidianMessages.rewriteInserted', {action: label}));
  } catch (error) {
    new Notice((error as Error)?.message || plugin.t('obsidianMessages.rewriteFailed', {action: label}));
  } finally {
    rewriteInFlight = false;
    progress.hide();
  }
};

export const runEditorRewriteAction = async (plugin: WiseMindObsidianPlugin, action: EditorRewriteAction) => {
  const target = getSelectionTarget(plugin);
  if (!target) {
    new Notice(plugin.t('obsidianMessages.noSelection'));
    return;
  }
  if (plugin.settings.rewritePreview || action === 'tags') {
    new RewritePreviewModal(plugin, action, target).open();
    return;
  }
  await rewriteWithoutPreview(plugin, action, target);
};

/** Opens chat with the note mention and the selection quoted, leaving the question to the user. */
export const askAboutSelection = async (plugin: WiseMindObsidianPlugin) => {
  const target = getSelectionTarget(plugin);
  if (!target) {
    new Notice(plugin.t('obsidianMessages.noSelection'));
    return;
  }
  const mention = target.file ? `@${target.file.path} ` : '';
  const quote = target.text.trim().split('\n').map(line => `> ${line}`).join('\n');
  await plugin.openChat(`${mention}\n${quote}\n\n`, false, false);
};
