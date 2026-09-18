import { PageLoader } from "@/components/ui/loading";

// Covers every /admin/* route the same way workspace/loading.tsx covers the
// workspace sub-routes — one shared loading state for the whole admin shell.
export default function AdminLoading() {
  return <PageLoader label="Loading administration" />;
}
