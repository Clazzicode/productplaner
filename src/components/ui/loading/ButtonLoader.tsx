"use client";

import type { ButtonHTMLAttributes } from "react";
import LoadingDots from "./LoadingDots";

export interface ButtonLoaderProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading: boolean;
  /** Shown next to the dots while `loading` — e.g. "Signing in", "Creating". */
  loadingLabel?: string;
  variant?: "primary" | "secondary";
}

const VARIANT_CLASSES: Record<NonNullable<ButtonLoaderProps["variant"]>, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700 disabled:hover:bg-indigo-600",
  secondary:
    "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 disabled:hover:bg-white",
};

/**
 * Guided-activation restructure (reference doc §14 "Quick Action Loading"):
 * the shared control for any action expected to finish in roughly under two
 * seconds. Disables itself while `loading` (blocks duplicate submits) and
 * swaps its label for "<loadingLabel> •••" — the "•••" is `LoadingDots`,
 * which already degrades to a static mark under `prefers-reduced-motion`.
 */
export default function ButtonLoader({
  loading,
  loadingLabel,
  variant = "primary",
  disabled,
  className = "",
  children,
  ...rest
}: ButtonLoaderProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {loading ? (
        <>
          <span>{loadingLabel ?? "Working"}</span>
          <LoadingDots />
        </>
      ) : (
        children
      )}
    </button>
  );
}
