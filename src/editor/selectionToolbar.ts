import {MarkdownView, Menu, setIcon} from 'obsidian';

import type WiseMindObsidianPlugin from '../main';
import type {EditorRewriteAction} from '../services/editorRewriteActions';

const SHOW_DELAY_MS = 120;
const TOOLBAR_GAP = 8;

type SelectionRect = {top: number; bottom: number; left: number; width: number; height: number};
type CodeMirrorLike = {
  coordsAtPos?: (pos: number) => {top: number; bottom: number; left: number; right: number} | null;
};

/**
 * Floating toolbar shown above a text selection in the Markdown editor.
 * It listens to a few document events and only measures the DOM once per selection,
 * so typing and scrolling are not affected.
 */
export class SelectionToolbar {
  private el: HTMLDivElement | null = null;
  private timer = 0;

  constructor(private plugin: WiseMindObsidianPlugin) {}

  register() {
    const onScroll = () => this.hide();
    this.plugin.registerDomEvent(document, 'mouseup', event => this.schedule(event as MouseEvent));
    this.plugin.registerDomEvent(document, 'keyup', event => {
      const {key, shiftKey, metaKey, ctrlKey} = event as KeyboardEvent;
      // Releasing Shift before the arrow key reports shiftKey=false, so the Shift key itself counts too.
      if (shiftKey || key === 'Shift' || ((metaKey || ctrlKey) && key.toLowerCase() === 'a')) this.schedule();
    });
    this.plugin.registerDomEvent(document, 'mousedown', event => {
      if (!this.el?.contains(event.target as Node)) this.hide();
    });
    this.plugin.registerDomEvent(document, 'keydown', event => {
      if (!(event as KeyboardEvent).shiftKey) this.hide();
    });
    document.addEventListener('scroll', onScroll, true);
    this.plugin.register(() => document.removeEventListener('scroll', onScroll, true));
    this.plugin.registerEvent(this.plugin.app.workspace.on('active-leaf-change', () => this.hide()));
    this.plugin.registerEvent(this.plugin.app.workspace.on('layout-change', () => this.hide()));
    this.plugin.registerDomEvent(window, 'blur', () => this.hide());
    this.plugin.register(() => this.destroy());
  }

  private schedule(event?: MouseEvent) {
    if (event && this.el?.contains(event.target as Node)) return;
    window.clearTimeout(this.timer);
    if (!this.plugin.settings.selectionToolbar) return this.hide();
    this.timer = window.setTimeout(() => this.show(event), SHOW_DELAY_MS);
  }

  private activeView() {
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.editor) return null;
    const mode = (view as unknown as {getMode?: () => string}).getMode?.();
    return mode && mode !== 'source' ? null : view;
  }

  private show(event?: MouseEvent) {
    const view = this.activeView();
    if (!view) return this.hide();
    // Keyboard selections must come from this editor, not from a modal or sidebar input.
    if (!view.contentEl.contains((event?.target as Node | undefined) ?? document.activeElement)) return this.hide();
    if (!view.editor.getSelection().trim()) return this.hide();

    const rect = this.selectionRect(view);
    if (!rect) return this.hide();

    const el = this.ensureElement();
    el.addClass('is-measuring', 'is-visible');
    const {width, height} = el.getBoundingClientRect();
    const above = rect.top - height - TOOLBAR_GAP;
    const top = above > TOOLBAR_GAP ? above : rect.bottom + TOOLBAR_GAP;
    const left = Math.min(
      Math.max(TOOLBAR_GAP, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - TOOLBAR_GAP,
    );
    el.setCssProps({
      '--wm-toolbar-top': `${Math.round(top)}px`,
      '--wm-toolbar-left': `${Math.round(left)}px`,
    });
    el.removeClass('is-measuring');
  }

  /** Prefers the DOM range; falls back to CodeMirror coordinates when the native selection is not exposed. */
  private selectionRect(view: MarkdownView): SelectionRect | null {
    const selection = window.getSelection();
    if (selection?.rangeCount && view.contentEl.contains(selection.anchorNode)) {
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (rect.width || rect.height) return rect;
    }
    const cm = (view.editor as unknown as {cm?: CodeMirrorLike}).cm;
    if (!cm?.coordsAtPos) return null;
    const editor = view.editor;
    const start = cm.coordsAtPos(editor.posToOffset(editor.getCursor('from')));
    const end = cm.coordsAtPos(editor.posToOffset(editor.getCursor('to')));
    if (!start || !end) return null;
    const top = Math.min(start.top, end.top);
    const bottom = Math.max(start.bottom, end.bottom);
    const left = start.top === end.top ? Math.min(start.left, end.left) : view.contentEl.getBoundingClientRect().left;
    const right = start.top === end.top ? Math.max(start.right, end.right) : left + view.contentEl.clientWidth;
    return {top, bottom, left, width: right - left, height: bottom - top};
  }

  hide() {
    window.clearTimeout(this.timer);
    this.el?.toggleClass('is-visible', false);
  }

  private destroy() {
    window.clearTimeout(this.timer);
    this.el?.remove();
    this.el = null;
  }

  private ensureElement() {
    if (this.el) return this.el;
    const el = document.body.createDiv({cls: 'wm2-selection-toolbar', attr: {role: 'toolbar'}});
    el.addEventListener('mousedown', event => event.preventDefault());

    const addButton = (icon: string, label: string, action: (event: MouseEvent) => void, withText = false) => {
      const button = el.createEl('button', {cls: 'clickable-icon', attr: {type: 'button', 'aria-label': label}});
      button.title = label;
      setIcon(button.createSpan(), icon);
      if (withText) button.createSpan({text: label});
      button.addEventListener('click', event => {
        action(event);
      });
    };
    const rewrite = (action: EditorRewriteAction) => () => {
      this.hide();
      void this.plugin.runEditorRewriteAction(action);
    };

    addButton('wand-2', this.plugin.t('editorRewrite.polish'), rewrite('polish'), true);
    addButton('pencil', this.plugin.t('editorRewrite.rewrite'), rewrite('rewrite'));
    addButton('message-square', this.plugin.t('rewritePreview.askAi'), () => {
      this.hide();
      void this.plugin.askAboutSelection();
    });
    addButton('layers', this.plugin.t('contextMenuV2.cards'), () => {
      this.hide();
      void this.plugin.runAssistantAction('cards', this.plugin.getActiveEditorSelection());
    });
    addButton('more-horizontal', this.plugin.t('selectionToolbar.more'), event => this.openMoreMenu(event));
    this.el = el;
    return el;
  }

  private openMoreMenu(event: MouseEvent) {
    const menu = new Menu();
    (['expand', 'shorten', 'translate', 'tags'] as EditorRewriteAction[]).forEach(action => {
      menu.addItem(item =>
        item.setTitle(this.plugin.t(`editorRewrite.${action}`)).onClick(() => {
          this.hide();
          void this.plugin.runEditorRewriteAction(action);
        }),
      );
    });
    menu.addSeparator();
    menu.addItem(item =>
      item.setTitle(this.plugin.t('contextMenuV2.summarize')).onClick(() => {
        this.hide();
        void this.plugin.runAssistantAction('summary', this.plugin.getActiveEditorSelection());
      }),
    );
    menu.addItem(item =>
      item.setTitle(this.plugin.t('contextMenuV2.send')).onClick(() => {
        this.hide();
        void this.plugin.sendActions.sendSelection();
      }),
    );
    menu.showAtMouseEvent(event);
  }
}
