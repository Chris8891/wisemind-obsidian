import type { DuplicatePolicy, ObsidianSourceItem, WiseMindSourceItem, WiseMindSourceType } from './types';

const OBSIDIAN_MARKER_RE = /<!--\s*wisemind:source=obsidian\s+path="([^"]+)"\s+hash="([^"]+)"\s*-->/;
const WISEMIND_MARKER_RE = /<!--\s*wisemind:source=wisemind\s+type="([^"]+)"\s+id="([^"]+)"\s+hash="([^"]+)"\s*-->/;

export type ParsedSourceMarker =
  | { source: 'obsidian'; path: string; hash: string }
  | { source: 'wisemind'; type: WiseMindSourceType; id: string; hash: string };

export const createObsidianSourceMarker = (item: Pick<ObsidianSourceItem, 'path' | 'contentHash'>) =>
  `<!-- wisemind:source=obsidian path="${escapeAttr(item.path)}" hash="${escapeAttr(item.contentHash)}" -->`;

export const createWiseMindSourceMarker = (item: Pick<WiseMindSourceItem, 'sourceType' | 'id' | 'contentHash'>) =>
  `<!-- wisemind:source=wisemind type="${escapeAttr(item.sourceType)}" id="${escapeAttr(String(item.id))}" hash="${escapeAttr(item.contentHash)}" -->`;

export const appendMarker = (markdown: string, marker: string) => {
  const cleaned = stripSourceMarkers(markdown).trimEnd();
  return `${cleaned}\n\n${marker}`;
};

export const stripSourceMarkers = (markdown: string) =>
  markdown.replace(OBSIDIAN_MARKER_RE, '').replace(WISEMIND_MARKER_RE, '').trimEnd();

export const findSourceMarker = (markdown: string): ParsedSourceMarker | null => {
  const obsidian = markdown.match(OBSIDIAN_MARKER_RE);
  if (obsidian) {
    return { source: 'obsidian', path: unescapeAttr(obsidian[1]), hash: unescapeAttr(obsidian[2]) };
  }

  const wisemind = markdown.match(WISEMIND_MARKER_RE);
  if (wisemind) {
    return {
      source: 'wisemind',
      type: unescapeAttr(wisemind[1]) as WiseMindSourceType,
      id: unescapeAttr(wisemind[2]),
      hash: unescapeAttr(wisemind[3]),
    };
  }

  return null;
};

export const planDuplicateAction = (params: {
  existingHash?: string | null;
  incomingHash: string;
  policy: DuplicatePolicy;
}): 'create' | 'update' | 'skip' => {
  if (!params.existingHash) return 'create';
  if (params.policy === 'duplicate') return 'create';
  if (params.policy === 'skip') return 'skip';
  return params.existingHash === params.incomingHash ? 'skip' : 'update';
};

const escapeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const unescapeAttr = (value: string) => value.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
