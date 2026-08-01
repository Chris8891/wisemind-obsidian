import type {TranscriptionOrganizeResult} from '../types';

type OrganizationSection = keyof TranscriptionOrganizeResult | 'ignore';

const classifyHeading = (heading: string): OrganizationSection => {
  const normalized = heading.toLowerCase().replace(/[：:]/g, '').trim();
  if (/(\u6807\u7b7e|tags?)/i.test(normalized)) return 'ignore';
  if (/(\u5f85\u529e|\u884c\u52a8|\u4efb\u52a1|todos?|action items?)/i.test(normalized)) {
    return 'todos';
  }
  if (
    /(\u91cd\u70b9|\u8981\u70b9|\u5173\u952e\u4fe1\u606f|key points?|highlights?)/i.test(
      normalized,
    )
  ) {
    return 'keyPoints';
  }
  return 'summary';
};

export const parseTranscriptionOrganizationMarkdown = (
  markdown: string,
): TranscriptionOrganizeResult => {
  const source = markdown.trim();
  const sections: Record<Exclude<OrganizationSection, 'ignore'>, string[]> = {
    summary: [],
    keyPoints: [],
    todos: [],
  };
  let current: OrganizationSection = 'summary';
  let foundHeading = false;

  source.split(/\r?\n/).forEach(line => {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/)?.[1];
    if (heading) {
      foundHeading = true;
      current = classifyHeading(heading);
      return;
    }
    if (current !== 'ignore') sections[current].push(line);
  });

  const summary = sections.summary.join('\n').trim();
  return {
    summary: summary || (!foundHeading ? source : ''),
    keyPoints: sections.keyPoints.join('\n').trim(),
    todos: sections.todos.join('\n').trim(),
  };
};
