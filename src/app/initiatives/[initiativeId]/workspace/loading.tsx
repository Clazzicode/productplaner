import { PageLoader } from "@/components/ui/loading";

// Guided-activation restructure (reference doc §15): covers every workspace
// sub-route (roadmap/features/epics/stories/sprints/capacity/executive) —
// Next.js shows this while the shared workspace layout + whichever page is
// loading, instead of a blank screen.
export default function WorkspaceLoading() {
  return <PageLoader label="Loading your workspace" />;
}
