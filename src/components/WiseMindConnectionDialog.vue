<script setup lang="ts">
  import {nextTick, onUnmounted, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowPathIcon,
    Cog6ToothIcon,
    RocketLaunchIcon,
    SignalSlashIcon,
  } from '@heroicons/vue/24/outline';
  import {shell} from 'electron';
  import {Notice, openExternal} from 'obsidian';

  import {rememberFocus, trapTabKey} from '../composables/dialogFocus';
  import {usePlugin} from '../composables/usePlugin';
  import {openWiseMindSettingsPage} from '../services/connectionDialog';
  import {buildWiseMindDeepLink} from '../wisemindApi';

  const props = defineProps<{
    open: boolean;
  }>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
  }>();

  const LAUNCH_RETRY_DELAY_MS = 2500;
  const LAUNCH_RETRY_ATTEMPTS = 4;

  const plugin = usePlugin();
  const {t} = useI18n();
  const checking = ref(false);
  const retryFailed = ref(false);
  const primaryButton = ref<HTMLButtonElement | null>(null);
  let launchTimer = 0;

  const clearLaunchTimer = () => {
    window.clearTimeout(launchTimer);
    launchTimer = 0;
  };

  const close = () => emit('update:open', false);

  // A drag that starts inside the dialog and ends on the backdrop must not close it.
  const pointerDownOnBackdrop = ref(false);
  const closeFromBackdrop = () => {
    if (pointerDownOnBackdrop.value) close();
    pointerDownOnBackdrop.value = false;
  };

  const overlay = ref<HTMLElement | null>(null);
  const dialogEl = ref<HTMLElement | null>(null);
  let restoreFocus: (() => void) | null = null;

  const onKeydown = (event: KeyboardEvent) => {
    // Keys typed in the editor or another modal belong to Obsidian, not to this dialog.
    // A button that turns disabled mid-check drops focus to <body>; Escape should still close then.
    const target = event.target as Node;
    if (!overlay.value?.contains(target) && target !== overlay.value?.ownerDocument.body) return;
    if (event.key === 'Tab') {
      trapTabKey(event, dialogEl.value);
      return;
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };

  watch(
    () => props.open,
    open => {
      if (open) {
        retryFailed.value = false;
        restoreFocus = rememberFocus();
        window.addEventListener('keydown', onKeydown, true);
        void nextTick(() => primaryButton.value?.focus());
        return;
      }
      window.removeEventListener('keydown', onKeydown, true);
      restoreFocus?.();
      restoreFocus = null;
      if (launchTimer) {
        clearLaunchTimer();
        checking.value = false;
      }
    },
    {immediate: true},
  );

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown, true);
    clearLaunchTimer();
  });

  const openSettings = () => {
    close();
    openWiseMindSettingsPage();
  };

  const retry = async (quiet = false) => {
    if (checking.value) return false;
    checking.value = true;
    retryFailed.value = false;
    let ok = false;
    try {
      ok = await plugin.testConnection();
    } catch {
      ok = false;
    } finally {
      checking.value = false;
    }
    if (!props.open) return ok;
    if (ok) {
      new Notice(t('common.connected'));
      close();
      return ok;
    }
    if (!quiet) retryFailed.value = true;
    return ok;
  };

  // The desktop app can take several seconds to start its local API after launching.
  const scheduleLaunchCheck = (attemptsLeft: number) => {
    checking.value = true;
    launchTimer = window.setTimeout(async () => {
      launchTimer = 0;
      checking.value = false;
      const ok = await retry(attemptsLeft > 1);
      if (!ok && attemptsLeft > 1 && props.open) scheduleLaunchCheck(attemptsLeft - 1);
    }, LAUNCH_RETRY_DELAY_MS);
  };

  const launchClient = async () => {
    try {
      await shell.openExternal(buildWiseMindDeepLink({}));
    } catch {
      void openExternal('https://wisemindai.app');
      return;
    }
    clearLaunchTimer();
    scheduleLaunchCheck(LAUNCH_RETRY_ATTEMPTS);
  };
</script>

<template>
  <Transition name="wm2-dialog-fade">
    <div
      v-if="props.open"
      ref="overlay"
      class="wm2-dialog-overlay"
      @pointerdown.self="pointerDownOnBackdrop = true"
      @click.self="closeFromBackdrop"
    >
      <section
        ref="dialogEl"
        class="wm2-dialog is-narrow"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wisemind-connection-title"
      >
        <button
          class="wm2-dialog-close"
          type="button"
          :aria-label="t('dialog.close')"
          @click="close"
          >✕</button
        >
        <div class="wm2-connect-hero">
          <span class="wm2-connect-icon">
            <SignalSlashIcon class="wm-icon" />
          </span>
          <h3 id="wisemind-connection-title" class="wm2-dialog-title">{{ t('connection.title') }}</h3>
          <span class="wm2-connect-address">{{
            t('connection.apiBaseUrl', {url: plugin.settings.apiBaseUrl})
          }}</span>
        </div>
        <p class="wm2-dialog-desc">{{ t('connection.description') }}</p>
        <ol class="wm2-connect-steps">
          <li>{{ t('connection.stepDownload', {url: 'https://wisemindai.app'}) }}</li>
          <li>{{ t('connection.stepOpen') }}</li>
          <li>{{ t('connection.stepEnableApi') }}</li>
          <li>{{ t('connection.stepBack') }}</li>
          <li>{{ t('connection.stepPort') }}</li>
        </ol>
        <p v-if="retryFailed" class="wm2-alert is-warning" role="alert">{{ t('onboarding.step1Fail') }}</p>
        <footer class="wm2-dialog-actions">
          <button
            class="wm2-btn is-ghost is-sm"
            type="button"
            @click="openSettings"
          >
            <Cog6ToothIcon class="wm-icon" />
            {{ t('shell.openSettings') }}
          </button>
          <button class="wm2-btn is-sm" type="button" :disabled="checking" @click="retry()">
            <ArrowPathIcon class="wm-icon" :class="{'wm2-spin': checking}" />
            {{ t('common.retry') }}
          </button>
          <button
            ref="primaryButton"
            class="wm2-btn is-primary is-sm"
            type="button"
            :disabled="checking"
            @click="launchClient"
          >
            <RocketLaunchIcon class="wm-icon" />
            {{ t('connection.launchClient') }}
          </button>
        </footer>
      </section>
    </div>
  </Transition>
</template>
