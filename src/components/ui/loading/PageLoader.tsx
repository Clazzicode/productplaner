import InlineLoader from "./InlineLoader";

/**
 * Guided-activation restructure (reference doc §15): a full-section loading
 * state for route-level `loading.tsx` files, so a page/data-heavy view never
 * leaves a blank white screen while it fetches — reference doc's own
 * examples: "Loading your roadmap •••", "Preparing your workspace •••".
 */
export default function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <InlineLoader label={label} className="text-base" />
    </div>
  );
}
