"use client";

import { useEffect, useRef } from "react";
import LeftNav, { type NavInitiative } from "./LeftNav";

/**
 * Off-canvas nav for phones and tablet-portrait (below `lg:`). Mounts the
 * existing, unmodified `LeftNav` — this component owns only the backdrop,
 * slide transform, and close affordances, so nav logic (active-link
 * matching, disabled reasons, initiative derivation) lives in exactly one
 * place. `topContent`/`bottomContent` are the header controls relocated out
 * of the compact mobile top bar (initiative switcher/+New above the nav
 * groups, Explain-mode/Start-over below them).
 */
export default function MobileNavDrawer(props: {
  open: boolean;
  onClose: () => void;
  initiatives: NavInitiative[];
  topContent?: React.ReactNode;
  bottomContent?: React.ReactNode;
}) {
  const { open, onClose } = props;
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={`fixed inset-y-0 left-0 z-40 flex w-56 transform flex-col overflow-hidden bg-white shadow-xl transition-transform duration-300 ease-in-out lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
            Menu
          </span>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>
        {props.topContent && (
          <div className="border-b border-neutral-200 px-3 py-3">{props.topContent}</div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <LeftNav initiatives={props.initiatives} />
        </div>
        {props.bottomContent && (
          <div className="border-t border-neutral-200 px-3 py-3">{props.bottomContent}</div>
        )}
      </div>
    </>
  );
}
