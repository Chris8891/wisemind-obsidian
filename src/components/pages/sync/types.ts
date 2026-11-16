import type {Component} from 'vue';

export type Direction = 'to-wisemind' | 'to-obsidian';
export type WiseMindCategory = 'documents' | 'knowledge' | 'notes';
export type DestinationTarget = 'notes' | 'documents' | 'knowledge';
export type TreeGroup<T> = {id: string; title: string; subtitle?: string; items: T[]};
export type DestinationItem = {
  key: string;
  target: DestinationTarget;
  value: string;
  title: string;
  meta: string;
};
export type SyncView = 'overview' | 'wizard';
export type WizardStep = 0 | 1 | 2;
export type TreeRow = {key: string; title: string; meta: string; checked: boolean};
export type TreeView = {
  id: string;
  title: string;
  countTitle: string;
  checkable: boolean;
  checked: boolean;
  partial: boolean;
  selectedCount: number;
  icon: Component;
  rowIcon: Component;
  total: number;
  rows: TreeRow[];
};
export type TextPart = {text: string; hit: boolean};
export type LastRun = {direction: Direction; category: WiseMindCategory; failedSources: string[]};
export type SyncTile = {key: string; label: string; value: number; tone: string};

export const TREE_ROW_PAGE = 200;
export const SEARCH_DEBOUNCE_MS = 150;
export const REFRESH_STALE_MS = 60 * 1000;
