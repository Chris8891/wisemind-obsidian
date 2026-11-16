<script setup lang="ts">
  import {computed, ref} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {GlobeAltIcon} from '@heroicons/vue/24/outline';
  import {Menu} from 'obsidian';

  import {usePlugin} from '../../../composables/usePlugin';
  import {FEATURES} from '../../../features';
  import {hasFeature} from '../../../services/capabilities';
  import type {ChatScope} from '../../../types';
  import WmTooltip from '../../WmTooltip.vue';

  const SCOPES: ChatScope[] = ['note', 'note-library', 'topic', 'web'];

  const {t} = useI18n();
  const plugin = usePlugin();
  const scope = ref<ChatScope>(plugin.settings.chatScope);
  const visible = computed(() => hasFeature(FEATURES.chatScope));

  const choose = async (value: ChatScope) => {
    scope.value = value;
    plugin.settings.chatScope = value;
    await plugin.saveSettings();
  };

  const openMenu = (event: MouseEvent) => {
    const anchor = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
    const menu = new Menu();
    SCOPES.forEach(value =>
      menu.addItem(item =>
        item
          .setTitle(t(`chatScope.${value}`))
          .setChecked(scope.value === value)
          .onClick(() => void choose(value)),
      ),
    );
    if (anchor) menu.showAtPosition({x: anchor.left, y: anchor.top - 4});
    else menu.showAtMouseEvent(event);
  };
</script>

<template>
  <WmTooltip v-if="visible" :content="t('chatScope.label')">
    <button class="wm2-chip wm2-plain-button wm2-chat-scope" type="button" @click="openMenu">
      <GlobeAltIcon class="wm-icon" />
      <span class="wm2-truncate">{{ t('chatScope.chip', {scope: t(`chatScope.${scope}`)}) }}</span>
    </button>
  </WmTooltip>
</template>
