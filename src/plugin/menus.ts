import type {Editor, Menu, MenuItem, TAbstractFile, TFile} from 'obsidian';

import {WISEMIND_ICON_ID} from '../constants';
import {FEATURES} from '../features';
import type WiseMindObsidianPlugin from '../main';
import {collectMarkdownFilesFromTargets} from '../quickActions';
import {hasFeature} from '../services/capabilities';
import type {EditorRewriteAction} from '../services/editorRewriteActions';

const SECTION = 'action';
const MENU_REWRITE_ACTIONS: EditorRewriteAction[] = ['polish', 'rewrite', 'expand', 'shorten', 'translate', 'tags'];

/** Fills a submenu when the Obsidian version supports it, otherwise appends items to the parent menu. */
const addGroup = (menu: Menu, title: string, build: (target: Menu) => void) => {
  let fallback = false;
  menu.addItem(item => {
    item.setTitle(title).setIcon(WISEMIND_ICON_ID).setSection(SECTION);
    const submenu = typeof (item as MenuItem & {setSubmenu?: unknown}).setSubmenu === 'function'
      ? item.setSubmenu()
      : null;
    if (submenu) build(submenu);
    else fallback = true;
  });
  if (fallback) build(menu);
};

/** One "WiseMindAI" entry per context menu keeps the file and editor menus tidy. */
export const registerMenus = (plugin: WiseMindObsidianPlugin) => {
  const t = plugin.t.bind(plugin);

  const addFileActions = (menu: Menu, targets: TAbstractFile | TAbstractFile[]) => {
    const files = collectMarkdownFilesFromTargets(plugin.app, targets) as TFile[];
    if (!files.length) return;
    addGroup(menu, t('contextMenuV2.root'), submenu => {
      submenu.addItem(item =>
        item.setTitle(t('contextMenuV2.send')).setIcon('send').onClick(() => void plugin.sendActions.sendFiles(files)),
      );
      if (files.length === 1) {
        const [file] = files;
        submenu.addItem(item =>
          item.setTitle(t('contextMenuV2.summarize')).setIcon('file-text').onClick(() => void plugin.runAssistantAction('summary', '', file)),
        );
        submenu.addItem(item =>
          item.setTitle(t('contextMenuV2.cards')).setIcon('layers').onClick(() => void plugin.runAssistantAction('cards', '', file)),
        );
        if (hasFeature(FEATURES.quiz)) {
          submenu.addItem(item =>
            item.setTitle(t('contextMenuV2.quiz')).setIcon('list-checks').onClick(() => void plugin.createQuiz(file)),
          );
        }
      } else {
        submenu.addItem(item =>
          item.setTitle(t('contextMenuV2.summarize')).setIcon('file-text').onClick(() => void plugin.runMultiNoteAction('summary', files)),
        );
        submenu.addItem(item =>
          item.setTitle(t('contextMenuV2.cards')).setIcon('layers').onClick(() => void plugin.runMultiNoteAction('cards', files)),
        );
      }
      if (hasFeature(FEATURES.taskPlan)) {
        submenu.addItem(item =>
          item.setTitle(t('contextMenuV2.aiTask')).setIcon('list-todo').onClick(() => void plugin.openAiTask(files)),
        );
      }
      const syncable = files.filter(file => plugin.syncEngine.rulesFor(file).length > 0);
      if (syncable.length) {
        submenu.addItem(item =>
          item.setTitle(t('contextMenuV2.syncNow')).setIcon('refresh-cw').onClick(() =>
            void plugin.syncEngine.sync({paths: syncable.map(file => file.path)}),
          ),
        );
      }
    });
  };

  const addEditorActions = (menu: Menu, editor: Editor) => {
    if (!editor.getSelection().trim()) return;
    addGroup(menu, t('contextMenuV2.root'), submenu => {
      MENU_REWRITE_ACTIONS.forEach(action => {
        submenu.addItem(item =>
          item.setTitle(t(`editorRewrite.${action}`)).onClick(() => void plugin.runEditorRewriteAction(action)),
        );
      });
      submenu.addSeparator();
      submenu.addItem(item => item.setTitle(t('contextMenuV2.ask')).setIcon('message-square').onClick(() => void plugin.askAboutSelection()));
      submenu.addItem(item =>
        item.setTitle(t('contextMenuV2.summarize')).setIcon('file-text').onClick(() =>
          void plugin.runAssistantAction('summary', plugin.getActiveEditorSelection()),
        ),
      );
      submenu.addItem(item =>
        item.setTitle(t('contextMenuV2.cards')).setIcon('layers').onClick(() =>
          void plugin.runAssistantAction('cards', plugin.getActiveEditorSelection()),
        ),
      );
      submenu.addItem(item => item.setTitle(t('contextMenuV2.send')).setIcon('send').onClick(() => void plugin.sendActions.sendSelection()));
    });
  };

  plugin.registerEvent(
    plugin.app.workspace.on('file-menu', (menu, file) => {
      if (!plugin.settings.showContextMenu) return;
      addFileActions(menu, file);
    }),
  );
  plugin.registerEvent(
    plugin.app.workspace.on('files-menu', (menu, files) => {
      if (!plugin.settings.showContextMenu) return;
      addFileActions(menu, files);
    }),
  );
  plugin.registerEvent(
    plugin.app.workspace.on('editor-menu', (menu, editor) => {
      if (!plugin.settings.showContextMenu) return;
      addEditorActions(menu, editor);
    }),
  );
};
