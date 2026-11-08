"use client";

import { useEffect, useState } from "react";

const edited = new Set<symbol>();
export function confirmPageNavigation() {
  return edited.size === 0 || window.confirm("You have unsaved changes. Leave this page and discard them?");
}

export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const key = Symbol();
    edited.add(key);
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", unload);
    return () => { edited.delete(key); window.removeEventListener("beforeunload", unload); };
  }, [dirty]);
}

export function useUnsavedDraft(value: unknown) {
  const serialized = JSON.stringify(value);
  const [saved, setSaved] = useState(serialized);
  useUnsavedChanges(serialized !== saved);
  return () => setSaved(serialized);
}

export function useNavigationGuard() {
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const destination = new URL(link.href);
      if (destination.origin === location.origin && destination.pathname === location.pathname && destination.search === location.search) return;
      if (!confirmPageNavigation()) { event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, []);
}
