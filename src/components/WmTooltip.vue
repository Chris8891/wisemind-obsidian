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

<!--
  Non-hoverable content closes as soon as the pointer leaves the trigger, so neighbouring buttons never flicker.
  Do not put aria-label on the slotted trigger: Obsidian shows a second native tooltip for aria-label.
  Icon-only buttons should use a .wm-visually-hidden label inside the control instead.
-->
<template>
  <TooltipRoot :delay-duration="350" disable-hoverable-content>
    <TooltipTrigger as-child>
      <slot ></slot>
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent
        v-if="content"
        class="wm-tooltip"
        :side="side"
        :side-offset="6"
        :collision-padding="8"
      >
        {{ content }}
        <TooltipArrow class="wm-tooltip-arrow" :width="10" :height="5" />
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>
