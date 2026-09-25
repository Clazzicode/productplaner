"use client";

import type { ButtonHTMLAttributes } from "react";
import LoadingDots from "./LoadingDots";

export interface ButtonLoaderProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading: boolean;
  /** Shown next to the dots while `loading` — e.g. "Signing in", "Creating". */
  loadingLabel?: string;
  variant?: "primary" | "secondary" | "plain";
}

// Each variant owns its full shape (padding/rounding/weight), not just color
// — two Tailwind utilities of the same category have equal specificity, so a
// variant can't reliably override a shared base utility (e.g. base `px-4`
// vs. a variant wanting `px-3`) without `!important` hacks at call sites.
const VARIANT_CLASSES: Record<NonNullable<ButtonLoaderProps["variant"]>, string> = {
  primary: "rounded-lg px-4 py-2 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:hover:bg-indigo-600",
  secondary:
    "rounded-lg px-4 py-2 text-sm font-semibold border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 disabled:hover:bg-white",
  // Looks like a plain row (e.g. inside a dropdown menu) rather than a button.
  plain: "w-full justify-start rounded-lg px-3 py-2 text-sm font-normal text-text-primary hover:bg-neutral-100",
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
      className={`inline-flex items-center gap-1.5 transition disabled:cursor-not-allowed disabled:opacity-70 ${VARIANT_CLASSES[variant]} ${className}`}
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
