export type EditorRewriteAction = 'rewrite' | 'expand' | 'shorten' | 'polish' | 'tags';

export const rewriteActionLabel = (action: EditorRewriteAction) => {
  if (action === 'expand') return '扩写';
  if (action === 'shorten') return '精简';
  if (action === 'polish') return '润色';
  if (action === 'tags') return '生成标签';
  return '改写';
};

export const rewriteActionCommandName = (action: EditorRewriteAction) =>
  `WiseMindAI: ${rewriteActionLabel(action)}选中文本`;

export const formatRewriteResult = (action: EditorRewriteAction, original: string, result: string) => {
  const label = rewriteActionLabel(action);
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
