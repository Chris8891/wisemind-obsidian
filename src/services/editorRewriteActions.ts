export type EditorRewriteAction = 'rewrite' | 'expand' | 'shorten' | 'polish' | 'tags';
export type EditorRewriteLabels = Record<EditorRewriteAction, string>;

export const defaultEditorRewriteLabels: EditorRewriteLabels = {
  rewrite: 'Rewrite',
  expand: 'Expand',
  shorten: 'Shorten',
  polish: 'Polish',
  tags: 'Generate tags',
};

export const rewriteActionLabel = (
  action: EditorRewriteAction,
  labels: EditorRewriteLabels = defaultEditorRewriteLabels,
) => labels[action];

export const rewriteActionCommandName = (
  action: EditorRewriteAction,
  labels: EditorRewriteLabels = defaultEditorRewriteLabels,
) => `WiseMindAI: ${rewriteActionLabel(action, labels)} selected text`;

export const formatRewriteResult = (
  action: EditorRewriteAction,
  original: string,
  result: string,
  labels: EditorRewriteLabels = defaultEditorRewriteLabels,
) => {
  const label = rewriteActionLabel(action, labels);
  if (action === 'tags') return `${original}\n\n${result.trim()}\n`;
  return `${original}\n\n> [!note] WiseMindAI ${label}\n> ${result.trim().replace(/\n/g, '\n> ')}\n`;
};

export const extractRewriteText = (response: any) =>
  String(
    response?.markdown ||
      response?.text ||
      response?.content ||
      response?.result ||
      response?.message ||
      '',
  ).trim();
