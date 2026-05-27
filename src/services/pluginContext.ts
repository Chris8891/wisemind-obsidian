import type { InjectionKey } from 'vue';

import type WiseMindObsidianPlugin from '../main';

export const pluginKey = Symbol('WiseMindObsidianPlugin') as InjectionKey<WiseMindObsidianPlugin>;
