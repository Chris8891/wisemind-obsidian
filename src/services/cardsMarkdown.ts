export type CardMarkdownItem = {
  content: string;
  tags?: string[];
};

export type CardsMarkdownLabels = {
  title: string;
  cardTitle: (index: number) => string;
  tags: string;
};

const defaultLabels: CardsMarkdownLabels = {
  title: 'WiseMindAI review cards',
  cardTitle: index => `Card ${index}`,
  tags: 'Tags',
};

export const formatCardsMarkdownBlock = (
  cards: CardMarkdownItem[],
  labels: CardsMarkdownLabels = defaultLabels,
) => {
  const usableCards = cards.filter(card => card.content.trim());
  if (!usableCards.length) return '';
  return [
    '',
    '',
    `## ${labels.title}`,
    '',
    ...usableCards.map((card, index) => {
      const tags = card.tags?.length
        ? `\n\n${labels.tags}: ${card.tags.map(tag => `#${String(tag).replace(/^#/, '')}`).join(' ')}`
        : '';
      return `### ${labels.cardTitle(index + 1)}\n\n${card.content.trim()}${tags}`;
    }),
    '',
  ].join('\n');
};
