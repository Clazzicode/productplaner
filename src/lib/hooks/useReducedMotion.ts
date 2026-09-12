"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/** SSR has no `window` — assume motion is allowed until the client mounts. */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * Guided-activation restructure (reference doc §18): every animated loading
 * indicator must have a non-animated equivalent for `prefers-reduced-motion`.
 * `useSyncExternalStore` (rather than `useState`+`useEffect`) is the correct
 * primitive for subscribing to this kind of external browser state — it
 * avoids the "setState synchronously in an effect" anti-pattern and handles
 * the SSR/hydration snapshot mismatch correctly on its own.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
