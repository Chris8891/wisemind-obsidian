<script setup lang="ts">
  import {nextTick, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {DocumentTextIcon} from '@heroicons/vue/24/outline';

  import type {NoteMentionCandidate} from '../services/noteMentionSearch';

  const props = defineProps<{
    candidates: NoteMentionCandidate[];
    activeIndex: number;
  }>();

  const emit = defineEmits<{
    pick: [candidate: NoteMentionCandidate];
  }>();

  const {t} = useI18n();
  const menuEl = ref<HTMLElement | null>(null);
  // While the pointer moves inside the menu the hovered row is the only highlight;
  // the next arrow key hands the highlight back to the keyboard-active row.
  const pointerMode = ref(false);

  const scrollActiveIntoView = async () => {
    await nextTick();
    const activeOption = menuEl.value?.querySelector<HTMLElement>('.wm2-mention-option.is-active');
    activeOption?.scrollIntoView({block: 'nearest'});
  };

  watch(
    () => props.activeIndex,
    () => {
      pointerMode.value = false;
      void scrollActiveIntoView();
    },
    {flush: 'post'},
  );

  watch(
    () => props.candidates,
    () => {
      if (menuEl.value) menuEl.value.scrollTop = 0;
      void scrollActiveIntoView();
    },
    {flush: 'post'},
  );
</script>

<template>
  <div
    ref="menuEl"
    class="wm-mention-menu"
    :class="{'is-pointer': pointerMode}"
    role="listbox"
    :aria-label="t('mention.ariaLabel')"
    @mousemove="pointerMode = true"
    @mouseleave="pointerMode = false"
  >
    <button
      v-for="(candidate, index) in candidates"
      :key="candidate.path"
      class="wm2-menu-item wm2-mention-option"
      :class="{'is-active': index === activeIndex}"
      type="button"
      role="option"
      tabindex="-1"
      :aria-selected="index === activeIndex"
      @mousedown.prevent="emit('pick', candidate)"
    >
      <span class="wm2-mention-title wm2-truncate">
        <DocumentTextIcon class="wm-icon" />
        <span class="wm2-truncate">{{ candidate.title }}</span>
      </span>
      <span class="wm2-mention-path">
        {{ candidate.folderPath || t('mention.rootFolder') }}
      </span>
    </button>
    <div v-if="!candidates.length" class="wm2-menu-empty">
      {{ t('mention.empty') }}
    </div>
  </div>
</template>
