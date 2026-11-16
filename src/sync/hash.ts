const encoder = new TextEncoder();

/** SHA-256 hex, identical to the desktop's createHash('sha256').update(content). Digesting runs off the JS thread. */
export const sha256Hex = async (text: string) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};

type IdleWindow = Window & {requestIdleCallback?: (cb: () => void, opts?: {timeout: number}) => number};

/** Lets the editor paint and handle input between units of background work. */
export const yieldToIdle = (timeout = 200) =>
  new Promise<void>(resolve => {
    const idle = (window as IdleWindow).requestIdleCallback;
    if (idle) idle(() => resolve(), {timeout});
    else window.setTimeout(resolve, 0);
  });

/** Yields only after `budgetMs` of continuous work so short loops stay fast. */
export const createYielder = (budgetMs = 12) => {
  let sliceStart = performance.now();
  return async () => {
    if (performance.now() - sliceStart < budgetMs) return;
    await yieldToIdle();
    sliceStart = performance.now();
  };
};
