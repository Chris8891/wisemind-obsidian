export type SyncPreviewDirection = 'to-wisemind' | 'to-obsidian';

export type SyncPreviewInput = {
  direction: SyncPreviewDirection;
  sourceCount: number;
  targetLabels: string[];
  overwriteExisting: boolean;
};

export type SyncPreview = {
  title: string;
  riskLevel: 'info' | 'warning';
  rows: Array<{label: string; value: string}>;
  warningText: string;
};

export const buildSyncPreview = (input: SyncPreviewInput): SyncPreview => {
  const sourceLabel =
    input.direction === 'to-wisemind' ? 'Obsidian 笔记' : 'WiseMindAI 内容';
  const targetLabel = input.direction === 'to-wisemind' ? 'WiseMindAI 目标' : 'Obsidian 目标';

  return {
    title: `准备同步 ${input.sourceCount} 篇 ${sourceLabel}`,
    riskLevel: input.overwriteExisting ? 'warning' : 'info',
    rows: input.targetLabels.length
      ? input.targetLabels.map(value => ({label: targetLabel, value}))
      : [{label: targetLabel, value: '未选择'}],
    warningText: input.overwriteExisting
      ? '当前会更新同来源内容，请确认目标位置和内容数量后继续。'
      : '',
  };
};
