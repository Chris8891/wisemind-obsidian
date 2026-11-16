import {Component, MarkdownRenderer} from 'obsidian';

import type WiseMindObsidianPlugin from '../main';

/** While streaming, re-render at most every 160ms instead of rebuilding the DOM for every token. */
const STREAMING_RENDER_INTERVAL = 160;

export const renderObsidianMarkdown = async (
  plugin: WiseMindObsidianPlugin,
  markdown: string,
  el: HTMLElement,
  sourcePath: string,
  owner: Component,
) => {
  try {
    await MarkdownRenderer.render(plugin.app, markdown, el, sourcePath, owner);
  } catch {
    el.setText(markdown);
  }
};

/**
 * Every render owns a fresh child Component and the previous one is unloaded first,
 * so handlers registered by the Obsidian renderer do not pile up during streaming.
 */
export const createMarkdownRenderScheduler = (plugin: WiseMindObsidianPlugin) => {
  let current: Component | null = null;
  let timer = 0;
  let lastRenderAt = 0;
  let pending: {el: HTMLElement; markdown: string; sourcePath: string} | null = null;
  let lastRendered = '';
  let disposed = false;

  const flush = async () => {
    timer = 0;
    if (!pending || disposed) return;
    const {el, markdown, sourcePath} = pending;
    pending = null;
    if (markdown === lastRendered && el.childElementCount) return;
    lastRendered = markdown;
    lastRenderAt = Date.now();

    const next = new Component();
    next.load();
    const fragment = createDiv();
    await renderObsidianMarkdown(plugin, markdown, fragment, sourcePath, next);
    if (disposed) {
      next.unload();
      return;
    }
    current?.unload();
    current = next;
    el.replaceChildren(...Array.from(fragment.childNodes));
  };

  return {
    schedule(el: HTMLElement, markdown: string, sourcePath: string, streaming: boolean) {
      pending = {el, markdown, sourcePath};
      if (timer) return;
      const wait = streaming ? Math.max(0, STREAMING_RENDER_INTERVAL - (Date.now() - lastRenderAt)) : 0;
      timer = window.setTimeout(() => void flush(), wait);
    },
    dispose() {
      disposed = true;
      if (timer) window.clearTimeout(timer);
      timer = 0;
      pending = null;
      current?.unload();
      current = null;
    },
  };
};
