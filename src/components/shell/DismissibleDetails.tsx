"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Native disclosure with the expected menu behavior for the persistent header. */
export default function DismissibleDetails({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const details = ref.current;
      if (details?.open && !details.contains(event.target as Node)) details.open = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const details = ref.current;
      if (event.key === "Escape" && details?.open) {
        details.open = false;
        details.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return <details ref={ref} className={className} onClickCapture={(event) => {
    if (event.target instanceof Element && event.target.closest("a[href]") && ref.current) ref.current.open = false;
  }}>{children}</details>;
}
