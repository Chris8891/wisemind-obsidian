export type ChatInsertFormat = 'markdown' | 'quote' | 'callout' | 'heading';
export type ChatInsertLabels = {
  title: string;
};

const quoteLines = (content: string) =>
  content
    .trim()
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n');

export const formatChatMessageForInsert = (
  content: string,
  format: ChatInsertFormat = 'markdown',
  labels: ChatInsertLabels = {title: 'WiseMindAI chat'},
) => {
  const text = content.trim();
  if (!text) return '';
  if (format === 'quote') {
    return `\n\n> [!quote] ${labels.title}\n${quoteLines(text)}\n`;
  }
  if (format === 'callout') {
    return `\n\n> [!note] ${labels.title}\n${quoteLines(text)}\n`;
  }
  if (format === 'heading') {
    return `\n\n## ${labels.title}\n\n${text}\n`;
  }
  return `\n\n${text}\n`;
};
