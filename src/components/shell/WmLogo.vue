<script setup lang="ts">
  import logoUrl from '../../assets/icons/wisemindai-app.png';

  const props = defineProps<{
    status?: 'connected' | 'disconnected' | 'checking';
  }>();
</script>

<template>
  <span class="wm2-logo" aria-hidden="true">
    <img class="wm2-logo-img" :src="logoUrl" alt="" draggable="false" />
    <span v-if="props.status" class="wm2-logo-dot" :class="`is-${props.status}`"></span>
  </span>
</template>
