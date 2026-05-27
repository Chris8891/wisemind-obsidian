<script setup lang="ts">
  import type {NoteMentionCandidate} from '../services/noteMentionSearch';

  defineProps<{
    candidates: NoteMentionCandidate[];
    activeIndex: number;
  }>();

  const emit = defineEmits<{
    pick: [candidate: NoteMentionCandidate];
  }>();
</script>

<template>
  <div
    class="wm-mention-menu"
    role="listbox"
    aria-label="引用笔记"
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
        {{ candidate.folderPath || '根目录' }}
      </span>
    </button>
    <div v-if="!candidates.length" class="wm-mention-empty">
      没有匹配的笔记
    </div>
  </div>
</template>
