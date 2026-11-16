export type VaultSearchItem = {
  path: string;
  title: string;
  folderPath: string;
  modifiedAt: number;
};

export type VaultSearchHit = VaultSearchItem & {
  score: number;
  titleMatch: boolean;
};

export type WiseMindSearchType = 'note' | 'file' | 'knowledge-document' | 'card' | 'topic';

export type WiseMindSearchHit = {
  key: string;
  type: WiseMindSearchType;
  group: string;
  id: string;
  title: string;
  snippet: string;
  /** Where the content came from, e.g. file / subscription / ai (semantic search reports it per item). */
  sourceType?: string;
  deckId?: string;
  folderId?: string;
  knowledgeBaseId?: string;
};

const WISEMIND_GROUPS: Array<[string, WiseMindSearchType]> = [
  ['notes', 'note'],
  ['files', 'file'],
  ['knowledge-documents', 'knowledge-document'],
  ['cards', 'card'],
  ['knowledge-bases', 'topic'],
];

/** Semantic requests report whether they fell back to keyword search (no embedding model yet). */
export const readSearchMode = (response: unknown) => {
  const value = (response || {}) as {mode?: unknown; degraded?: unknown};
  return {mode: value.mode === 'semantic' ? 'semantic' : 'keyword', degraded: value.degraded === true};
};

const optionalId = (value: unknown) => (value === undefined || value === null ? undefined : String(value));

/** Title and path substring match only, so searching never reads note contents. */
export const searchVaultItems = (items: VaultSearchItem[], query: string, limit = 8): VaultSearchHit[] => {
  const keywords = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!keywords.length) return [];
  const hits: VaultSearchHit[] = [];
  for (const item of items) {
    const title = item.title.toLowerCase();
    const path = item.path.toLowerCase();
    if (!keywords.every(keyword => path.includes(keyword))) continue;
    const titleMatch = keywords.every(keyword => title.includes(keyword));
    const prefix = title.startsWith(keywords[0]);
    const score = (titleMatch ? 100 : 40) + (prefix ? 30 : 0) - Math.min(title.length, 60) / 10;
    hits.push({...item, score, titleMatch});
  }
  return hits
    .sort((a, b) => b.score - a.score || b.modifiedAt - a.modifiedAt)
    .slice(0, limit);
};

export const normalizeWiseMindSearch = (response: unknown, limitPerGroup = 4): WiseMindSearchHit[] => {
  const payload = (response as {data?: unknown})?.data ?? response;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const record = payload as Record<string, unknown>;
  return WISEMIND_GROUPS.flatMap(([group, type]) => {
    const items = Array.isArray(record[group]) ? (record[group] as Record<string, unknown>[]) : [];
    return items.slice(0, limitPerGroup).map((item, index) => ({
      key: `${group}:${item?.id ?? index}`,
      type,
      group,
      id: optionalId(item?.id) || '',
      title: String(item?.title || item?.name || item?.snippet || '').trim(),
      snippet: String(item?.snippet || item?.content || item?.summary || '').replace(/\s+/g, ' ').trim().slice(0, 140),
      sourceType: item?.sourceType ? String(item.sourceType) : undefined,
      deckId: optionalId(item?.deckId),
      folderId: optionalId(item?.folderId),
      knowledgeBaseId: optionalId(item?.knowledgeBaseId ?? (type === 'topic' ? item?.id : undefined)),
    }));
  }).filter(item => item.title);
};
