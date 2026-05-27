import { inject } from 'vue';

import type WiseMindObsidianPlugin from '../main';
import { pluginKey } from '../services/pluginContext';

export const usePlugin = (): WiseMindObsidianPlugin => {
  const plugin = inject(pluginKey);
  if (!plugin) {
    throw new Error('WiseMindAI plugin context is not available');
  }
  return plugin;
};
