<script setup lang="ts">
  import {useI18n} from 'vue-i18n';
  import {PencilSquareIcon} from '@heroicons/vue/24/outline';

  import {usePlugin} from '../composables/usePlugin';
  import {openWiseMindSettingsPage} from '../services/connectionDialog';

  const props = defineProps<{
    open: boolean;
  }>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
  }>();

  const plugin = usePlugin();
  const {t} = useI18n();
  const close = () => emit('update:open', false);

  const openSettings = () => {
    close();
    openWiseMindSettingsPage();
  };
</script>

<template>
  <div v-if="props.open" class="wm-modal-overlay" @click.self="close">
    <section
      class="wm-modal-box wm-history-dialog wm-connection-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wisemind-connection-title"
    >
      <header class="wm-history-dialog-header">
        <h3 id="wisemind-connection-title" class="wm-dialog-title">{{ t('connection.title') }}</h3>
        <button
          class="btn btn-sm btn-circle btn-ghost absolute right-4 top-4"
          type="button"
          @click="close"
          >✕</button
        >
      </header>
      <p class="wm-muted">
        {{ t('connection.description') }}
      </p>
      <div class="wm-connection-api-row">
        <span>{{ t('connection.apiBaseUrl', {url: plugin.settings.apiBaseUrl}) }}</span>
        <button class="wm-icon-button" type="button" @click="openSettings">
          <PencilSquareIcon class="wm-icon" />
        </button>
      </div>
      <ol class="wm-connection-steps">
        <li>
          {{ t('connection.stepDownload', {url: 'https://wisemindai.app'}) }}
        </li>
        <li>{{ t('connection.stepOpen') }}</li>
        <li>{{ t('connection.stepEnableApi') }}</li>
        <li>{{ t('connection.stepBack') }}</li>
        <li>{{ t('connection.stepPort') }}</li>
      </ol>
      <footer class="wm-dialog-actions wm-actions">
        <button class="wm-button is-primary" type="button" @click="close">{{
          t('connection.ok')
        }}</button>
      </footer>
    </section>
  </div>
</template>
