import wiseMindLogoIcon from './assets/icons/wisemindai-logo.svg?raw';

export const WISEMIND_VIEW_TYPE = 'wisemindai-view';
export const WISEMIND_ICON_ID = 'wisemindai-logo';
export const WISEMIND_OBSIDIAN_ICON = wiseMindLogoIcon
  .replace(/^<svg[^>]*>/, '<g transform="scale(0.09765625)">')
  .replace(/<\/svg>\s*$/, '</g>');
