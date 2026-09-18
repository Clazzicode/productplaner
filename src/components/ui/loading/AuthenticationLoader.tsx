"use client";

import { useReducedMotion } from "@/lib/hooks/useReducedMotion";

/**
 * Guided-activation restructure (reference doc §17 "Authentication
 * Loading"): a small, tasteful "signing you in" motion — three dots
 * stepping forward in sequence (distinct from the pulsing LoadingDots used
 * for quick-action buttons elsewhere), not a literal illustrated character.
 * Meant to disappear immediately on redirect; never blocks or slows the
 * actual sign-in request, purely a "something is happening" signal shown
 * alongside it.
 */
export default function AuthenticationLoader({ label = "Signing you in" }: { label?: string }) {
  const reduced = useReducedMotion();
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-4">
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full bg-accent ${reduced ? "" : "animate-walk-step"}`}
            style={reduced ? undefined : { animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <p className="text-sm text-text-secondary">{label}</p>
    </div>
  );
}
