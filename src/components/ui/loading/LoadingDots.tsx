"use client";

import { useReducedMotion } from "@/lib/hooks/useReducedMotion";

/**
 * Three animated dots ("•••") — the reference doc's quick-action loading
 * pattern (e.g. "Signing in •••"). Falls back to static, non-animated dots
 * under `prefers-reduced-motion` instead of just omitting the animation
 * class — see globals.css's `animate-loading-dot` keyframe.
 */
export default function LoadingDots({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`inline-block h-1 w-1 rounded-full bg-current ${reduced ? "" : "animate-loading-dot"}`}
          style={reduced ? undefined : { animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  );
}
