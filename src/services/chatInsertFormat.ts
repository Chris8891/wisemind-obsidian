export type ChatInsertFormat = 'markdown' | 'quote' | 'callout' | 'heading';

const quoteLines = (content: string) =>
  content
    .trim()
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n');

export const formatChatMessageForInsert = (
  content: string,
  format: ChatInsertFormat = 'markdown',
) => {
  const text = content.trim();
  if (!text) return '';
  if (format === 'quote') {
    return `\n\n> [!quote] WiseMindAI 对话\n${quoteLines(text)}\n`;
  }
  if (format === 'callout') {
    return `\n\n> [!note] WiseMindAI 对话\n${quoteLines(text)}\n`;
  }
  if (format === 'heading') {
    return `\n\n## WiseMindAI 对话\n\n${text}\n`;
  }
  return `\n\n${text}\n`;
};
