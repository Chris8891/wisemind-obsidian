import {onBeforeUnmount, type Ref, ref, watch} from 'vue';

const STICK_THRESHOLD_PX = 40;
const SMOOTH_SCROLL_SETTLE_MS = 600;

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Keeps a scroll box pinned to its end while its content grows (streaming output),
 * until the user scrolls up; scrolling back near the end resumes following.
 */
export function useStickToBottom(container: Ref<HTMLElement | null>) {
  const following = ref(true);
  let observer: ResizeObserver | null = null;
  let childWatcher: MutationObserver | null = null;
  let jumping = false;
  let jumpTimer = 0;

  const scrollToEnd = () => {
    const el = container.value;
    if (el && following.value) el.scrollTop = el.scrollHeight;
  };

  const observeChildren = (el: HTMLElement) => {
    observer?.disconnect();
    observer = new ResizeObserver(scrollToEnd);
    Array.from(el.children).forEach(child => observer?.observe(child));
  };

  const onScroll = () => {
    const el = container.value;
    // A smooth jump fires intermediate scroll events that must not switch following back off.
    if (!el || jumping) return;
    following.value = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
  };

  const detach = (el: HTMLElement | null) => {
    observer?.disconnect();
    observer = null;
    childWatcher?.disconnect();
    childWatcher = null;
    el?.removeEventListener('scroll', onScroll);
  };

  watch(
    container,
    (el, previous) => {
      detach(previous ?? null);
      if (!el) return;
      el.addEventListener('scroll', onScroll, {passive: true});
      observeChildren(el);
      // Children swap (e.g. editor <-> preview), so re-observe whenever the direct child list changes.
      childWatcher = new MutationObserver(() => observeChildren(el));
      childWatcher.observe(el, {childList: true});
    },
    {flush: 'post'},
  );

  onBeforeUnmount(() => {
    window.clearTimeout(jumpTimer);
    detach(container.value);
  });

  return {
    /** False once the user has scrolled away from the end; use it to show a "jump to latest" button. */
    following,
    /** Call when a new run starts so the box follows the fresh output. */
    reset() {
      following.value = true;
      scrollToEnd();
    },
    /** Scrolls to the end (smoothly unless reduced motion is on) and resumes following. */
    jumpToLatest() {
      const el = container.value;
      following.value = true;
      if (!el) return;
      if (prefersReducedMotion()) {
        el.scrollTop = el.scrollHeight;
        return;
      }
      jumping = true;
      window.clearTimeout(jumpTimer);
      el.scrollTo({top: el.scrollHeight, behavior: 'smooth'});
      jumpTimer = window.setTimeout(() => {
        jumping = false;
      }, SMOOTH_SCROLL_SETTLE_MS);
    },
  };
}
