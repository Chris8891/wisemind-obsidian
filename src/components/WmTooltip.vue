<script setup lang="ts">
import {TooltipArrow, TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger} from 'reka-ui';

withDefaults(
  defineProps<{
    content: string;
    side?: 'top' | 'right' | 'bottom' | 'left';
  }>(),
  {
    side: 'top',
  },
);
</script>

<template>
  <TooltipRoot :delay-duration="250">
    <TooltipTrigger as-child>
      <slot ></slot>
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent class="wm-tooltip" :side="side" :side-offset="6">
        {{ content }}
        <TooltipArrow class="wm-tooltip-arrow" />
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>
