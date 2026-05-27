export type CardMarkdownItem = {
  content: string;
  tags?: string[];
};

export const formatCardsMarkdownBlock = (cards: CardMarkdownItem[]) => {
  const usableCards = cards.filter(card => card.content.trim());
  if (!usableCards.length) return '';
  return [
    '',
    '',
    '## WiseMindAI 复习卡片',
    '',
    ...usableCards.map((card, index) => {
      const tags = card.tags?.length
        ? `\n\n标签：${card.tags.map(tag => `#${String(tag).replace(/^#/, '')}`).join(' ')}`
        : '';
      return `### 卡片 ${index + 1}\n\n${card.content.trim()}${tags}`;
    }),
    '',
  ].join('\n');
};
