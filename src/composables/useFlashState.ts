import {onBeforeUnmount, ref} from 'vue';

export const FLASH_DURATION_MS = 1500;

/** Short-lived "done" flags keyed by button, e.g. a copy button that shows a check for 1.5s. */
export function useFlashState(duration = FLASH_DURATION_MS) {
  const active = ref<Record<string, boolean>>({});
  const timers = new Map<string, number>();

  const flash = (key: string) => {
    window.clearTimeout(timers.get(key));
    active.value = {...active.value, [key]: true};
    timers.set(
      key,
      window.setTimeout(() => {
        timers.delete(key);
        const next = {...active.value};
        delete next[key];
        active.value = next;
      }, duration),
    );
  };

  const isFlashing = (key: string) => Boolean(active.value[key]);

  onBeforeUnmount(() => {
    timers.forEach(timer => window.clearTimeout(timer));
    timers.clear();
  });

  return {flash, isFlashing};
}
