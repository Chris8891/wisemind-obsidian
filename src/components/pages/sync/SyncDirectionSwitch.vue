<script setup lang="ts">
  import {useI18n} from 'vue-i18n';

  import {useSyncState} from './syncState';

  defineProps<{
    // The wizard pane is a disabled fieldset while running; the overview switch locks itself.
    lockWhileRunning?: boolean;
  }>();

  const {t} = useI18n();
  const {direction, running, directionOptions, setDirection} = useSyncState();
</script>

<template>
  <div
    v-if="directionOptions.length > 1"
    class="wm2-segmented wm2-sync-segmented"
    role="radiogroup"
    :aria-label="t('syncPage.syncDirection')"
  >
    <button
      v-for="option in directionOptions"
      :key="option.value"
      :class="{'is-active': direction === option.value}"
      type="button"
      role="radio"
      :aria-checked="direction === option.value"
      :title="option.title"
      :disabled="lockWhileRunning && running"
      @click="setDirection(option.value)"
    >
      <component :is="option.icon" class="wm-icon" />
      <span class="wm2-truncate">{{ option.label }}</span>
    </button>
  </div>
</template>
