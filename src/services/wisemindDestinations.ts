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

export const targetLabel = (target: WiseMindDestinationTarget) => {
  if (target === 'notes') return 'WiseMindAI 笔记';
  if (target === 'documents') return 'WiseMindAI 文档';
  return 'WiseMindAI 知识库';
};

export const loadWiseMindDestinationOptions = async (
  api: WiseMindApiClient,
  target: WiseMindDestinationTarget,
): Promise<WiseMindDestinationOption[]> => {
  if (target === 'notes') {
    return folderOptions(target, await api.listNoteFolders().catch(() => []));
  }
  if (target === 'documents') {
    return folderOptions(target, await api.listFileFolders().catch(() => []));
  }
  const bases = await api.listKnowledgeBases().catch(() => []);
  if (!bases.length) {
    return [
      {
        target,
        value: '',
        label: '没有知识库',
        meta: '请先在 WiseMindAI 中创建知识库',
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
      meta: '知识库',
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
): WiseMindDestinationOption[] => [
  {
    target,
    value: '',
    label: '根目录',
    meta: '根目录',
  },
  ...folders.map(folder => {
    const path = resolveFolderPath(folder.id, folders) || folder.name;
    return {
      target,
      value: path,
      label: path,
      meta: '文件夹',
    };
  }),
];
