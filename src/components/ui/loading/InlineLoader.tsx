import LoadingDots from "./LoadingDots";

/**
 * Guided-activation restructure (reference doc §15 "Page / Data Loading"):
 * a plain inline "<label> •••" indicator for a piece of UI that's fetching
 * or working, outside of a button — e.g. "Loading your roadmap •••".
 */
export default function InlineLoader({ label = "Loading", className = "" }: { label?: string; className?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 text-text-muted ${className}`}
    >
      <span>{label}</span>
      <LoadingDots />
    </span>
  );
}
