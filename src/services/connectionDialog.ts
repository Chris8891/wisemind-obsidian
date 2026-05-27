export const WISEMIND_OPEN_CONNECTION_DIALOG_EVENT = 'wisemindai:open-connection-dialog';
export const WISEMIND_OPEN_SETTINGS_EVENT = 'wisemindai:open-settings';

export const openWiseMindConnectionDialog = () => {
  window.dispatchEvent(new CustomEvent(WISEMIND_OPEN_CONNECTION_DIALOG_EVENT));
};

export const openWiseMindSettingsPage = () => {
  window.dispatchEvent(new CustomEvent(WISEMIND_OPEN_SETTINGS_EVENT));
};
