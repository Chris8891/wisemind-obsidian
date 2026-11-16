import {
  type App,
  type Editor,
  type EditorPosition,
  type EditorRange,
  MarkdownView,
  Modal,
  Notice,
  Platform,
  type TFile,
} from 'obsidian';

import {resolveLanguageSetting} from '../i18n';
import type WiseMindObsidianPlugin from '../main';
import {type EditorRewriteAction, extractRewriteText} from '../services/editorRewriteActions';
import {diffText, mergeFrontmatterTags, parseGeneratedTags} from '../services/textDiff';

export type RewriteTarget = {
  editor: Editor;
  file: TFile | null;
  from: EditorPosition;
  to: EditorPosition;
  text: string;
};

type ViewMode = 'compare' | 'new';

/**
 * Finds where the original selection is now. A leaf reuses its editor when it opens another note,
 * so the file is checked first; edits elsewhere in the note are tolerated when the text is unique.
 */
export const locateRewriteTarget = (app: App, target: RewriteTarget): EditorRange | null => {
  const {editor, file, from, to, text} = target;
  const owner = app.workspace
    .getLeavesOfType('markdown')
    .map(leaf => leaf.view)
    .find((view): view is MarkdownView => view instanceof MarkdownView && view.editor === editor);
  if (owner && file && owner.file?.path !== file.path) return null;
  try {
    if (editor.getRange(from, to) === text) return {from, to};
    const content = editor.getValue();
    const index = content.indexOf(text);
    if (index < 0 || content.indexOf(text, index + 1) >= 0) return null;
    return {from: editor.offsetToPos(index), to: editor.offsetToPos(index + text.length)};
  } catch {
    return null;
  }
};

/** Shows the AI result first and only touches the note after the user confirms. */
export class RewritePreviewModal extends Modal {
  private result = '';
  private loading = false;
  private applying = false;
  private viewMode: ViewMode = 'compare';
  private controller: AbortController | null = null;
  private bodyEl!: HTMLDivElement;
  private metaEl!: HTMLSpanElement;
  private instructionEl!: HTMLInputElement;
  private retryButton!: HTMLButtonElement;
  private actionButtons: HTMLButtonElement[] = [];
  private modeButtons: Partial<Record<ViewMode, HTMLButtonElement>> = {};

  constructor(
    private plugin: WiseMindObsidianPlugin,
    private action: EditorRewriteAction,
    private target: RewriteTarget,
  ) {
    super(plugin.app);
  }

  private get isTags() {
    return this.action === 'tags';
  }

  onOpen() {
    this.modalEl.addClass('wm2-modal', 'wm2-rewrite-modal');
    this.titleEl.setText(`WiseMindAI · ${this.plugin.t(`editorRewrite.${this.action}`)}`);
    this.contentEl.empty();

    const toolbar = this.contentEl.createDiv({cls: 'wm2-rewrite-toolbar'});
    if (!this.isTags) {
      const modes = toolbar.createDiv({cls: 'wm2-segmented'});
      (['compare', 'new'] as ViewMode[]).forEach(mode => {
        const button = modes.createEl('button', {
          text: this.plugin.t(mode === 'compare' ? 'rewritePreview.compare' : 'rewritePreview.newOnly'),
          attr: {type: 'button'},
        });
        button.addEventListener('click', () => {
          this.viewMode = mode;
          this.render();
        });
        this.modeButtons[mode] = button;
      });
    }
    this.metaEl = toolbar.createSpan({cls: 'wm2-muted'});

    this.bodyEl = this.contentEl.createDiv({cls: 'wm2-rewrite-body'});

    const refine = this.contentEl.createDiv({cls: 'wm2-rewrite-refine'});
    this.instructionEl = refine.createEl('input', {
      attr: {type: 'text', placeholder: this.plugin.t('rewritePreview.instructionPlaceholder')},
    });
    this.instructionEl.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        void this.generate();
      }
    });
    this.retryButton = refine.createEl('button', {text: this.plugin.t('rewritePreview.retry'), attr: {type: 'button'}});
    this.retryButton.addEventListener('click', () => void this.generate());

    const footer = this.contentEl.createDiv({cls: 'modal-button-container'});
    const discard = footer.createEl('button', {text: this.plugin.t('rewritePreview.discard'), attr: {type: 'button'}});
    discard.addEventListener('click', () => this.close());
    if (this.isTags) {
      const apply = footer.createEl('button', {cls: 'mod-cta', text: this.plugin.t('rewritePreview.applyTags'), attr: {type: 'button'}});
      apply.addEventListener('click', () => void this.applyTags());
      this.actionButtons.push(apply);
    } else {
      const copy = footer.createEl('button', {text: this.plugin.t('summary.copy'), attr: {type: 'button'}});
      copy.addEventListener('click', () => void this.copyResult());
      const below = footer.createEl('button', {text: this.plugin.t('rewritePreview.insertBelow'), attr: {type: 'button'}});
      below.addEventListener('click', () => this.apply('below'));
      const replace = footer.createEl('button', {
        cls: 'mod-cta',
        text: this.plugin.t('rewritePreview.replace'),
        attr: {type: 'button', title: this.plugin.t('rewritePreview.replaceShortcut')},
      });
      replace.addEventListener('click', () => this.apply('replace'));
      this.actionButtons.push(copy, below, replace);
    }

    this.scope.register(['Mod'], 'Enter', event => {
      event.preventDefault();
      if (this.loading || !this.result) return false;
      if (this.isTags) void this.applyTags();
      else this.apply('replace');
      return false;
    });

    void this.generate();
  }

  private async copyResult() {
    if (!this.result) return;
    try {
      await navigator.clipboard.writeText(this.result);
      new Notice(this.plugin.t('shared.copied'));
    } catch {
      new Notice(this.plugin.t('rewritePreview.copyFailed'));
    }
  }

  onClose() {
    this.controller?.abort();
    this.controller = null;
    this.contentEl.empty();
  }

  private async generate() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.loading = true;
    this.render();
    try {
      const response = await this.plugin.api.rewriteText(
        {
          text: this.target.text,
          action: this.action,
          language: resolveLanguageSetting(this.plugin.settings.assistantDefaults.language),
          instruction: this.instructionEl?.value.trim() || undefined,
        },
        {signal: controller.signal},
      );
      if (controller.signal.aborted) return;
      this.result = extractRewriteText(response);
      if (!this.result) new Notice(this.plugin.t('obsidianMessages.noInsertContent'));
    } catch (error) {
      if (controller.signal.aborted) return;
      new Notice((error as Error)?.message || this.plugin.t('obsidianMessages.rewriteFailed', {
        action: this.plugin.t(`editorRewrite.${this.action}`),
      }));
    } finally {
      if (this.controller === controller) {
        this.loading = false;
        this.controller = null;
        this.render();
      }
    }
  }

  private render() {
    if (!this.bodyEl) return;
    (Object.keys(this.modeButtons) as ViewMode[]).forEach(mode =>
      this.modeButtons[mode]?.toggleClass('is-active', mode === this.viewMode),
    );
    this.retryButton.disabled = this.loading;
    this.actionButtons.forEach(button => {
      button.disabled = this.loading || !this.result;
    });
    this.metaEl.setText(
      this.result && !this.isTags
        ? this.plugin.t('rewritePreview.lengthChange', {from: this.target.text.length, to: this.result.length})
        : '',
    );

    this.bodyEl.empty();
    if (this.loading) {
      this.bodyEl.createDiv({cls: 'wm2-rewrite-loading', text: this.plugin.t('rewritePreview.generating')});
      return;
    }
    if (!this.result) return;

    if (this.isTags) {
      const tags = this.bodyEl.createDiv({cls: 'wm2-row wm2-chips'});
      parseGeneratedTags(this.result).forEach(tag => tags.createSpan({cls: 'wm2-chip', text: `#${tag}`}));
      return;
    }

    if (this.viewMode === 'new') {
      this.bodyEl.createDiv({cls: 'wm2-rewrite-text', text: this.result});
      return;
    }

    const parts = diffText(this.target.text, this.result);
    if (!parts) {
      this.bodyEl.createDiv({cls: 'wm2-muted', text: this.plugin.t('rewritePreview.diffTooLong')});
      const columns = this.bodyEl.createDiv({cls: 'wm2-rewrite-columns'});
      columns.createDiv({cls: 'wm2-rewrite-text is-original', text: this.target.text});
      columns.createDiv({cls: 'wm2-rewrite-text', text: this.result});
      return;
    }
    const diffEl = this.bodyEl.createDiv({cls: 'wm2-rewrite-text wm2-diff'});
    parts.forEach(part => {
      if (part.type === 'same') diffEl.appendText(part.text);
      else diffEl.createEl(part.type === 'added' ? 'ins' : 'del', {text: part.text});
    });
  }

  private apply(mode: 'replace' | 'below') {
    if (!this.result || this.loading) return;
    const range = locateRewriteTarget(this.app, this.target);
    if (!range) {
      new Notice(this.plugin.t('rewritePreview.selectionChanged'));
      return;
    }
    const {editor} = this.target;
    const {from, to} = range;
    const undoKey = Platform.isMacOS ? '⌘Z' : 'Ctrl+Z';
    if (mode === 'replace') {
      editor.transaction({changes: [{from, to, text: this.result}]});
      new Notice(this.plugin.t('rewritePreview.replaced', {key: undoKey}));
    } else {
      editor.transaction({changes: [{from: to, to, text: `\n\n${this.result}`}]});
      new Notice(this.plugin.t('rewritePreview.insertedBelow', {key: undoKey}));
    }
    this.close();
  }

  private async applyTags() {
    const file = this.target.file;
    const tags = parseGeneratedTags(this.result);
    if (this.loading || this.applying) return;
    if (!file || !tags.length) {
      new Notice(this.plugin.t(file ? 'obsidianMessages.noInsertContent' : 'obsidianMessages.noMarkdownNote'));
      return;
    }
    this.applying = true;
    let addedCount = 0;
    try {
      await this.app.fileManager.processFrontMatter(file, frontmatter => {
        const merged = mergeFrontmatterTags(frontmatter.tags, tags);
        frontmatter.tags = merged.tags;
        addedCount = merged.addedCount;
      });
    } catch (error) {
      new Notice((error as Error)?.message || this.plugin.t('obsidianMessages.rewriteFailed', {
        action: this.plugin.t('editorRewrite.tags'),
      }));
      return;
    } finally {
      this.applying = false;
    }
    new Notice(this.plugin.t('rewritePreview.tagsApplied', {count: addedCount}));
    this.close();
  }
}
