import { createI18n } from 'vue-i18n';
import { moment } from 'obsidian';

import type { WiseMindLanguageSetting, WiseMindResolvedLanguage } from '../types';

import en_US from './en_US';
import zh_CN from './zh_CN';

export const messages = {
  zh_CN,
  en_US,
};

export const languageOptions: Array<{ value: WiseMindLanguageSetting; labelKey: string }> = [
  { value: 'system', labelKey: 'settings.languageSystem' },
  { value: 'zh_CN', labelKey: 'settings.languageZhCN' },
  { value: 'en_US', labelKey: 'settings.languageEnUS' },
];

export const resolveObsidianLanguage = (): WiseMindResolvedLanguage => {
  const locale = String(moment?.locale?.() || '').toLowerCase();
  return locale.startsWith('zh') ? 'zh_CN' : 'en_US';
};

export const resolveLanguageSetting = (
  language: WiseMindLanguageSetting | undefined,
): WiseMindResolvedLanguage => {
  if (language === 'zh_CN' || language === 'en_US') return language;
  return resolveObsidianLanguage();
};

export const i18n = createI18n({
  legacy: false,
  locale: resolveObsidianLanguage(),
  fallbackLocale: 'zh_CN',
  messages,
});

export const setI18nLocale = (language: WiseMindLanguageSetting | undefined) => {
  i18n.global.locale.value = resolveLanguageSetting(language);
  window.dispatchEvent(new CustomEvent('wisemindai:i18n-locale-changed'));
};

export const translate = (language: WiseMindLanguageSetting | undefined, key: string, params?: Record<string, unknown>) =>
  i18n.global.t(key, params || {}, { locale: resolveLanguageSetting(language) });
