import { ref } from 'vue';

import { openWiseMindConnectionDialog } from '../services/connectionDialog';

import { usePlugin } from './usePlugin';

export const useWiseMindConnectionGuard = () => {
  const plugin = usePlugin();
  const connectionDialogOpen = ref(false);
  const checkingConnection = ref(false);

  const ensureWiseMindConnected = async () => {
    if (checkingConnection.value) return false;
    checkingConnection.value = true;
    try {
      const connected = await plugin.testConnection();
      if (!connected) openWiseMindConnectionDialog();
      return connected;
    } finally {
      checkingConnection.value = false;
    }
  };

  return {
    checkingConnection,
    connectionDialogOpen,
    ensureWiseMindConnected,
  };
};
