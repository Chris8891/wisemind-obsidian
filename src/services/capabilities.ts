import {reactive} from 'vue';

import {compareVersions, type FeatureKey, MIN_CLIENT_VERSION} from '../features';
import type {WiseMindCapabilities} from '../types';

/**
 * What the connected desktop app can do. Entry points read this to decide whether to show up,
 * and AI actions check `aiReady` before sending anything.
 */
export const capabilityState = reactive({
  loaded: false,
  /** Unknown (old clients) counts as ready so nothing is blocked by a missing field. */
  aiReady: true,
  aiModel: '',
  appVersion: '',
  features: [] as string[],
});

export const applyCapabilities = (value: WiseMindCapabilities | null) => {
  capabilityState.loaded = Boolean(value);
  capabilityState.aiReady = value?.aiReady !== false;
  capabilityState.aiModel = value?.aiModel || '';
  capabilityState.appVersion = value?.appVersion || '';
  capabilityState.features = Array.isArray(value?.features) ? value!.features.map(String) : [];
};

export const hasFeature = (feature: FeatureKey) => capabilityState.features.includes(feature);

/** Marks AI as unavailable after the desktop answered AI_NOT_CONFIGURED, so the banner shows right away. */
export const markAiNotReady = () => {
  capabilityState.aiReady = false;
  capabilityState.aiModel = '';
};

/**
 * The desktop app answers but predates the v2 local API, so new entry points stay hidden.
 * Every 2.x client reports appVersion; clients before 2.0 leave it out (or have no capabilities route).
 */
export const isClientOutdated = () =>
  capabilityState.loaded &&
  (!capabilityState.appVersion || compareVersions(capabilityState.appVersion, MIN_CLIENT_VERSION) < 0);
