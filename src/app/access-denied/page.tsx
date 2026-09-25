import Link from "next/link";
import { FocusedLayout } from "@/components/layout/PageLayouts";

export const dynamic = "force-dynamic";

/**
 * Reached only when an initiative genuinely exists in the user's own
 * organization but their resolved access is below what the page required —
 * a real permission boundary, not a raw error. A missing or cross-org
 * initiative uses Next's standard notFound() instead (see
 * src/lib/access/guards.ts) so this page never confirms or denies whether a
 * resource from another organization exists (docs/V2-RESOURCE-ACCESS.md §17).
 */
export default function AccessDeniedPage() {
  return (
    <FocusedLayout>
      <div className="text-center">
        <h1 className="text-2xl font-bold">You no longer have access to this initiative</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Your access may have changed, or it was revoked. If this doesn&apos;t look right, ask
          your Organization Admin.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/home"
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/initiatives"
            className="rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            View Initiatives
          </Link>
        </div>
      </div>
    </FocusedLayout>
  );
}
