"use client";

import { useReducedMotion } from "@/lib/hooks/useReducedMotion";

/** A single pulsing placeholder block — compose these for a bespoke skeleton
 * layout; `SkeletonLoader` below covers the common "a few lines" case. */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  return (
    <div
      aria-hidden
      className={`rounded-lg bg-neutral-200/80 ${reduced ? "" : "animate-pulse"} ${className}`}
    />
  );
}

/**
 * Guided-activation restructure (reference doc §15): a lightweight skeleton
 * for data-heavy views, instead of a blank screen while they load. Tailwind's
 * `animate-pulse` doesn't respect `prefers-reduced-motion` on its own —
 * SkeletonBlock gates it through the same useReducedMotion() hook the rest
 * of the loading system uses.
 */
export default function SkeletonLoader({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} className={`h-4 ${i === rows - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}
