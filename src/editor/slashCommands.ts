import {
  type Editor,
  type EditorPosition,
  EditorSuggest,
  type EditorSuggestContext,
  type EditorSuggestTriggerInfo,
  type TFile,
} from 'obsidian';

import {type FeatureKey,FEATURES} from '../features';
import type WiseMindObsidianPlugin from '../main';
import {hasFeature} from '../services/capabilities';

type SlashCommandId = 'summary' | 'rewrite' | 'cards' | 'quiz' | 'ask' | 'task';

type SlashCommand = {
  id: SlashCommandId;
  aliases: string[];
  feature?: FeatureKey;
};

const SLASH_COMMANDS: SlashCommand[] = [
  {id: 'summary', aliases: ['summary', 'zj']},
  {id: 'rewrite', aliases: ['rewrite', 'gx']},
  {id: 'cards', aliases: ['cards', 'fx']},
  {id: 'quiz', aliases: ['quiz', 'cs'], feature: FEATURES.quiz},
  {id: 'ask', aliases: ['ask', 'wd']},
  {id: 'task', aliases: ['task', 'rw'], feature: FEATURES.taskPlan},
];

const TRIGGER = /(?:^|\s)(\/wm)([^\s/]*)$/;

/** Expands the cursor to the surrounding paragraph so "/wm rewrite" works without a selection. */
const selectParagraph = (editor: Editor, line: number) => {
  let start = line;
  let end = line;
  while (start > 0 && editor.getLine(start - 1).trim()) start -= 1;
  while (end < editor.lineCount() - 1 && editor.getLine(end + 1).trim()) end += 1;
  if (!editor.getLine(start).trim() && start === end) return false;
  editor.setSelection({line: start, ch: 0}, {line: end, ch: editor.getLine(end).length});
  return true;
};

/** `/wm` in the editor lists the WiseMindAI actions; the trigger text is removed before running. */
export class SlashCommandSuggest extends EditorSuggest<SlashCommand> {
  constructor(private plugin: WiseMindObsidianPlugin) {
    super(plugin.app);
    this.limit = SLASH_COMMANDS.length;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
    if (!this.plugin.settings.slashCommands || !file || file.extension !== 'md') return null;
    const before = editor.getLine(cursor.line).slice(0, cursor.ch);
    const match = TRIGGER.exec(before);
    if (!match) return null;
    const length = match[1].length + match[2].length;
    return {start: {line: cursor.line, ch: cursor.ch - length}, end: cursor, query: match[2].toLowerCase()};
  }

  getSuggestions(context: EditorSuggestContext) {
    const query = context.query.trim();
    return SLASH_COMMANDS.filter(command => !command.feature || hasFeature(command.feature)).filter(command => {
      if (!query) return true;
      const label = this.plugin.t(`slashCommands.${command.id}`).toLowerCase();
      return label.includes(query) || command.aliases.some(alias => alias.startsWith(query));
    });
  }

  renderSuggestion(command: SlashCommand, el: HTMLElement) {
    el.addClass('wm2-slash-item');
    el.createDiv({cls: 'wm2-slash-title', text: this.plugin.t(`slashCommands.${command.id}`)});
    el.createDiv({cls: 'wm2-slash-desc', text: this.plugin.t(`slashCommands.${command.id}Desc`)});
  }

  selectSuggestion(command: SlashCommand) {
    const context = this.context;
    if (!context) return;
    const {editor, file, start, end} = context;
    editor.replaceRange('', start, end);
    this.close();
    void this.run(command.id, editor, file);
  }

  private async run(id: SlashCommandId, editor: Editor, file: TFile) {
    const plugin = this.plugin;
    const selection = editor.getSelection();
    switch (id) {
      case 'summary':
      case 'cards':
        await plugin.runAssistantAction(id, selection, file);
        return;
      case 'rewrite':
        if (!selection.trim() && !selectParagraph(editor, editor.getCursor().line)) return;
        await plugin.runEditorRewriteAction('rewrite');
        return;
      case 'quiz':
        await plugin.createQuiz(file, selection);
        return;
      case 'ask':
        if (selection.trim()) await plugin.askAboutSelection();
        else await plugin.openChat(`@${file.path} `, false, false);
        return;
      case 'task':
        await plugin.openAiTask([file]);
    }
  }
}
