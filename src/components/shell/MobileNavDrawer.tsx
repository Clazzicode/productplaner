"use client";

import { useEffect, useRef } from "react";
import LeftNav, { type NavInitiative } from "./LeftNav";

/**
 * Off-canvas nav for constrained viewports (below `xl:`). Mounts the
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
  canManageWorkspace?: boolean;
  userId?: string;
  topContent?: React.ReactNode;
  bottomContent?: React.ReactNode;
}) {
  const { open, onClose } = props;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select:not([disabled]), [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0);
        const first = controls[0]; const last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 xl:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        aria-hidden={!open}
        inert={!open}
        className={`fixed inset-y-0 left-0 z-40 flex w-[min(20rem,100vw)] transform flex-col overflow-hidden bg-white shadow-xl transition-transform duration-300 ease-in-out xl:hidden ${
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
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto [&>nav]:h-auto [&>nav]:min-h-full [&>nav]:w-full [&>nav]:overflow-visible">
          <LeftNav initiatives={props.initiatives} canManageWorkspace={props.canManageWorkspace} userId={props.userId} />
        </div>
        {props.bottomContent && (
          <div className="border-t border-neutral-200 px-3 py-3">{props.bottomContent}</div>
        )}
      </div>
    </>
  );
}
