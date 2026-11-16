import {onMounted, watch} from 'vue';
import {Notice} from 'obsidian';

import {ENABLE_REVERSE_SYNC} from '../../../features';
import {panelState} from '../../../services/panelStore';
import {listVaultMetadata} from '../../../vaultScanner';
import {loadWiseMindSources} from '../../../wisemindSourceScanner';

import {buildDestinationGroups, getDefaultDestinationKeys, sourceKey} from './syncGrouping';
import {REFRESH_STALE_MS} from './types';
import type {SyncCore} from './useSyncCore';
import type {SyncSelection} from './useSyncSelection';

/** Loads the vault and the WiseMindAI data, and reloads when the page comes back into view. */
export function useSyncRefresh(core: SyncCore, selection: SyncSelection, applyDefaultPlan: () => void) {
  const {plugin, t, loading, running, connectionError, hasLoadedObsidianItems, view} = core;
  const {selectedObsidian, selectedObsidianFolders, selectedWiseMind, selectedDestinations} =
    selection;

  // Defaults and the default plan are applied on the first successful load only; later refreshes keep
  // the user's current picks and just drop the ones that no longer exist.
  let hasLoadedWiseMind = false;
  let lastRefreshAt = 0;

  const defaultDestinationKeys = (data: Parameters<typeof buildDestinationGroups>[1]) =>
    getDefaultDestinationKeys(t, data, plugin.settings.contextMenuDefaults.knowledgeBaseName);

  const loadObsidian = async () => {
    try {
      // Metadata only — bodies are hydrated when a sync actually runs.
      core.obsidianItems.value = listVaultMetadata(plugin.app, {
        maxFileSizeKb: plugin.settings.maxFileSizeKb,
        ignorePatterns: plugin.settings.ignorePatterns,
      });
      const availablePaths = new Set(core.obsidianItems.value.map(item => item.path));
      if (!hasLoadedObsidianItems.value) {
        selectedObsidian.value = new Set();
        selectedObsidianFolders.value = new Set([plugin.settings.defaultObsidianRootFolder || '']);
      } else {
        selectedObsidian.value = new Set(
          [...selectedObsidian.value].filter(path => availablePaths.has(path)),
        );
      }
      hasLoadedObsidianItems.value = true;
    } catch (error: any) {
      new Notice(error?.message || t('syncPage.scanObsidianFailed'));
    }
  };

  const applySnapshotSelection = (snapshot: NonNullable<typeof core.snapshot.value>, items: typeof core.wiseMindItems.value) => {
    const availableKeys = new Set(items.map(sourceKey));
    selectedWiseMind.value = new Set(
      [...selectedWiseMind.value].filter(key => availableKeys.has(key)),
    );
    const destinationKeys = new Set(
      buildDestinationGroups(t, snapshot, '').flatMap(group => group.items.map(item => item.key)),
    );
    const keptDestinations = [...selectedDestinations.value].filter(key => destinationKeys.has(key));
    if (!hasLoadedWiseMind) {
      selectedDestinations.value = new Set(defaultDestinationKeys(snapshot));
      applyDefaultPlan();
    } else {
      selectedDestinations.value = new Set(
        keptDestinations.length ? keptDestinations : defaultDestinationKeys(snapshot),
      );
    }
    hasLoadedWiseMind = true;
  };

  const loadWiseMind = async () => {
    try {
      core.workspaceState.value = await plugin.api.getWorkspaceState().catch(() => null);
      if (!ENABLE_REVERSE_SYNC) {
        // Destinations only need folders / topics — skip notes, documents, and topic bodies.
        const snapshot = await plugin.api.loadSnapshot({destinationsOnly: true});
        core.snapshot.value = snapshot;
        core.wiseMindItems.value = [];
        applySnapshotSelection(snapshot, []);
        return;
      }
      const loaded = await loadWiseMindSources(plugin.api, {
        includeNotes: true,
        includeDocuments: true,
        includeKnowledgeDocuments: true,
      });
      core.snapshot.value = loaded.snapshot;
      core.wiseMindItems.value = loaded.items;
      applySnapshotSelection(loaded.snapshot, loaded.items);
    } catch (error: any) {
      connectionError.value = error?.message || t('syncPage.connectWiseMindFailed');
      core.snapshot.value = null;
      core.wiseMindItems.value = [];
      selectedDestinations.value = new Set();
    }
  };

  const refresh = async () => {
    if (loading.value || running.value) return;
    loading.value = true;
    connectionError.value = '';
    lastRefreshAt = Date.now();
    try {
      await loadObsidian();
      await loadWiseMind();
    } finally {
      loading.value = false;
    }
  };

  onMounted(() => void refresh());

  // The page stays mounted while hidden; pick up vault edits and desktop workspace switches when the
  // user comes back, and recover automatically once the desktop app is reachable again.
  watch(
    () => panelState.tab,
    tab => {
      if (tab === 'sync' && view.value === 'overview' && Date.now() - lastRefreshAt > REFRESH_STALE_MS)
        void refresh();
    },
  );
  watch(
    () => panelState.connected,
    connected => {
      if (connected && (connectionError.value || !hasLoadedWiseMind)) void refresh();
    },
  );

  return {refresh};
}
