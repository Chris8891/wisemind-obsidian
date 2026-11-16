import {inject, type InjectionKey, provide} from 'vue';

import {useSyncCore} from './useSyncCore';
import {useSyncPicker} from './useSyncPicker';
import {useSyncPlans} from './useSyncPlans';
import {useSyncRefresh} from './useSyncRefresh';
import {useSyncResult} from './useSyncResult';
import {useSyncRun} from './useSyncRun';
import {useSyncSelection} from './useSyncSelection';
import {useSyncSummary} from './useSyncSummary';

const createSyncState = () => {
  const core = useSyncCore();
  const selection = useSyncSelection(core);
  const summary = useSyncSummary(core, selection);
  const picker = useSyncPicker(core, selection, summary);
  const plans = useSyncPlans(core, selection);
  const result = useSyncResult(core);
  const run = useSyncRun(core, selection, summary, result);
  const {refresh} = useSyncRefresh(core, selection, plans.applyDefaultPlan);
  return {...core, ...selection, ...summary, ...picker, ...plans, ...result, ...run, refresh};
};

export type SyncState = ReturnType<typeof createSyncState>;

const syncStateKey: InjectionKey<SyncState> = Symbol('wm-sync-state');

/** Builds the sync page state and shares it with the child components of SyncPage. */
export const provideSyncState = () => {
  const state = createSyncState();
  provide(syncStateKey, state);
  return state;
};

export const useSyncState = (): SyncState => {
  const state = inject(syncStateKey);
  if (!state) throw new Error('Sync page state is not available');
  return state;
};
