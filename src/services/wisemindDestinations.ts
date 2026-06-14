import type {ImportTargetSelection, WiseMindFolder} from '../types';
import type {WiseMindApiClient} from '../wisemindApi';
import {resolveFolderPath} from '../wisemindSourceScanner';

export type WiseMindDestinationTarget = keyof ImportTargetSelection;

export type WiseMindDestinationOption = {
  target: WiseMindDestinationTarget;
  value: string;
  label: string;
  meta: string;
  disabled?: boolean;
};

export type WiseMindDestination = {
  target: WiseMindDestinationTarget;
  value: string;
  title: string;
};

export type WiseMindDestinationLabels = {
  notes: string;
  documents: string;
  knowledge: string;
  noKnowledge: string;
  createKnowledgeFirst: string;
  knowledgeMeta: string;
  rootFolder: string;
  folder: string;
};

export const defaultWiseMindDestinationLabels: WiseMindDestinationLabels = {
  notes: 'WiseMindAI notes',
  documents: 'WiseMindAI documents',
  knowledge: 'WiseMindAI knowledge base',
  noKnowledge: 'No knowledge bases',
  createKnowledgeFirst: 'Create a knowledge base in WiseMindAI first',
  knowledgeMeta: 'Knowledge base',
  rootFolder: 'Root',
  folder: 'Folder',
};

export const targetLabel = (
  target: WiseMindDestinationTarget,
  labels: WiseMindDestinationLabels = defaultWiseMindDestinationLabels,
) => {
  if (target === 'notes') return labels.notes;
  if (target === 'documents') return labels.documents;
  return labels.knowledge;
};

export const loadWiseMindDestinationOptions = async (
  api: WiseMindApiClient,
  target: WiseMindDestinationTarget,
  labels: WiseMindDestinationLabels = defaultWiseMindDestinationLabels,
): Promise<WiseMindDestinationOption[]> => {
  if (target === 'notes') {
    return folderOptions(target, await api.listNoteFolders().catch(() => []), labels);
  }
  if (target === 'documents') {
    return folderOptions(target, await api.listFileFolders().catch(() => []), labels);
  }
  const bases = await api.listKnowledgeBases().catch(() => []);
  if (!bases.length) {
    return [
      {
        target,
        value: '',
        label: labels.noKnowledge,
        meta: labels.createKnowledgeFirst,
        disabled: true,
      },
    ];
  }
  return bases.map((base: any) => {
    const title = String(base.name || base.title || `knowledge-${base.id}`);
    return {
      target,
      value: title,
      label: title,
      meta: labels.knowledgeMeta,
    };
  });
};

export const optionToDestination = (
  target: WiseMindDestinationTarget,
  option: WiseMindDestinationOption,
): WiseMindDestination => ({
  target,
  value: option.value,
  title: option.label,
});

const folderOptions = (
  target: 'notes' | 'documents',
  folders: WiseMindFolder[],
  labels: WiseMindDestinationLabels,
): WiseMindDestinationOption[] => [
  {
    target,
    value: '',
    label: labels.rootFolder,
    meta: labels.rootFolder,
  },
  ...folders.map(folder => {
    const path = resolveFolderPath(folder.id, folders) || folder.name;
    return {
      target,
      value: path,
      label: path,
      meta: labels.folder,
    };
  }),
];
