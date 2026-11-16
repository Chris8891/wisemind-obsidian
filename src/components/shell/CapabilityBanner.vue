<script setup lang="ts">
  import {computed, ref} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {ArrowDownTrayIcon, BoltSlashIcon} from '@heroicons/vue/24/outline';
  import {openExternal} from 'obsidian';

  import {usePlugin} from '../../composables/usePlugin';
  import {MIN_CLIENT_VERSION} from '../../features';
  import {capabilityState, isClientOutdated} from '../../services/capabilities';
  import {panelState} from '../../services/panelStore';

  const DOWNLOAD_URL = 'https://wisemindai.app';

  const {t} = useI18n();
  const plugin = usePlugin();
  const opening = ref(false);

  const mode = computed(() => {
    if (!panelState.connected || !capabilityState.loaded) return '';
    if (isClientOutdated()) return 'outdated';
    if (!capabilityState.aiReady) return 'ai';
    return '';
  });

  const connectAi = async () => {
    if (opening.value) return;
    opening.value = true;
    try {
      await plugin.openAiSettings();
    } finally {
      opening.value = false;
    }
  };

  const update = () => void openExternal(DOWNLOAD_URL);
</script>

<template>
  <Transition name="wm2-collapse">
    <div v-if="mode === 'ai'" key="ai" class="wm2-sync-alert wm2-capability-banner" role="status">
      <BoltSlashIcon class="wm-icon" />
      <span class="wm2-sync-alert-text">
        <strong>{{ t('capability.aiNotReadyTitle') }}</strong>
        <small>{{ t('capability.aiNotReadyDesc') }}</small>
      </span>
      <button class="wm2-btn is-primary is-xs" type="button" :disabled="opening" @click="connectAi">
        {{ t('capability.connectAi') }}
      </button>
    </div>
    <div v-else-if="mode === 'outdated'" key="outdated" class="wm2-sync-alert wm2-capability-banner" role="status">
      <ArrowDownTrayIcon class="wm-icon" />
      <span class="wm2-sync-alert-text">
        <strong>{{ t('capability.outdatedTitle') }}</strong>
        <small>{{
          capabilityState.appVersion
            ? t('capability.outdatedDesc', {current: capabilityState.appVersion, required: MIN_CLIENT_VERSION})
            : t('capability.outdatedDescUnknown', {required: MIN_CLIENT_VERSION})
        }}</small>
      </span>
      <button class="wm2-btn is-xs" type="button" @click="update">{{ t('capability.update') }}</button>
    </div>
  </Transition>
</template>
