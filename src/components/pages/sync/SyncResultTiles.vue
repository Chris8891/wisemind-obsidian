<script setup lang="ts">
  import type {SyncTile} from './types';

  defineProps<{
    tiles: SyncTile[];
    boxed?: boolean;
  }>();
</script>

<template>
  <div class="wm2-sync-tiles">
    <div
      v-for="tile in tiles"
      :key="tile.key"
      class="wm2-sync-tile"
      :class="[{'is-boxed': boxed}, tile.tone, {'is-zero': !tile.value}]"
    >
      <strong class="wm2-tabular">{{ tile.value }}</strong>
      <small>{{ tile.label }}</small>
    </div>
  </div>
</template>
