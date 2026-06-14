<script setup lang="ts">
  import {nextTick, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';

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

  watch(
    () => props.activeIndex,
    async () => {
      await nextTick();
      const activeOption = menuEl.value?.querySelector<HTMLElement>('.wm-mention-option.is-active');
      activeOption?.scrollIntoView({block: 'nearest'});
    },
    {flush: 'post'},
  );
</script>

<template>
  <div
    ref="menuEl"
    class="wm-mention-menu"
    role="listbox"
    :aria-label="t('mention.ariaLabel')"
  >
    <button
      v-for="(candidate, index) in candidates"
      :key="candidate.path"
      class="wm-mention-option"
      :class="{'is-active': index === activeIndex}"
      type="button"
      role="option"
      :aria-selected="index === activeIndex"
      @mousedown.prevent="emit('pick', candidate)"
    >
      <span class="wm-mention-title">{{ candidate.title }}</span>
      <span class="wm-mention-path">
        {{ candidate.folderPath || t('mention.rootFolder') }}
      </span>
    </button>
    <div v-if="!candidates.length" class="wm-mention-empty">
      {{ t('mention.empty') }}
    </div>
  </div>
</template>
