export type SyncPreviewDirection = 'to-wisemind' | 'to-obsidian';

export type SyncPreviewInput = {
  direction: SyncPreviewDirection;
  sourceCount: number;
  targetLabels: string[];
  overwriteExisting: boolean;
};

export type SyncPreviewLabels = {
  obsidianNotes: string;
  wiseMindContent: string;
  wiseMindTarget: string;
  obsidianTarget: string;
  title: (params: {count: number; source: string}) => string;
  unselected: string;
  overwriteWarning: string;
};

const defaultLabels: SyncPreviewLabels = {
  obsidianNotes: 'Obsidian notes',
  wiseMindContent: 'WiseMindAI content',
  wiseMindTarget: 'WiseMindAI target',
  obsidianTarget: 'Obsidian target',
  title: ({count, source}) => `Ready to sync ${count} ${source}`,
  unselected: 'Not selected',
  overwriteWarning:
    'This will update content from the same source. Confirm the target location and content count before continuing.',
};

export type SyncPreview = {
  title: string;
  riskLevel: 'info' | 'warning';
  rows: Array<{label: string; value: string}>;
  warningText: string;
};

export const buildSyncPreview = (
  input: SyncPreviewInput,
  labels: SyncPreviewLabels = defaultLabels,
): SyncPreview => {
  const sourceLabel =
    input.direction === 'to-wisemind' ? labels.obsidianNotes : labels.wiseMindContent;
  const targetLabel = input.direction === 'to-wisemind' ? labels.wiseMindTarget : labels.obsidianTarget;

  return {
    title: labels.title({count: input.sourceCount, source: sourceLabel}),
    riskLevel: input.overwriteExisting ? 'warning' : 'info',
    rows: input.targetLabels.length
      ? input.targetLabels.map(value => ({label: targetLabel, value}))
      : [{label: targetLabel, value: labels.unselected}],
    warningText: input.overwriteExisting ? labels.overwriteWarning : '',
  };
};
