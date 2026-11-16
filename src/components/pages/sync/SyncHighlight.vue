<script setup lang="ts">
  import {computed} from 'vue';

  import {highlightParts} from './syncGrouping';

  const props = defineProps<{
    text: string;
    query: string;
  }>();

  // Renders bare text fragments so it can sit inside a truncating span without extra wrappers.
  const parts = computed(() => highlightParts(props.text, props.query));
</script>

<template>
  <template v-for="(part, index) in parts" :key="index"
    ><mark v-if="part.hit" class="wm2-sync-hit">{{ part.text }}</mark
    ><template v-else>{{ part.text }}</template></template
  >
</template>
