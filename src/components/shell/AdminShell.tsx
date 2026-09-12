import Link from "next/link";
import Sidebar from "./Sidebar";
import type { NavigationItemProps } from "./NavigationItem";

const NOT_YET_AVAILABLE = "Not yet available.";

const ADMIN_GROUPS: { title: string; items: NavigationItemProps[] }[] = [
  {
    title: "Administration",
    items: [
      { label: "Overview", href: "/admin" },
      { label: "Users", href: "/admin/users" },
      { label: "Roles & Access", href: "/admin/access" },
      { label: "Organizations", href: null, disabled: { reason: NOT_YET_AVAILABLE } },
      { label: "Dashboard Configuration", href: "/admin/dashboard-configuration" },
      { label: "Integrations", href: null, disabled: { reason: NOT_YET_AVAILABLE } },
      { label: "Activity / Audit", href: null, disabled: { reason: NOT_YET_AVAILABLE } },
      { label: "Settings", href: null, disabled: { reason: NOT_YET_AVAILABLE } },
    ],
  },
];

/**
 * Guided-activation restructure (reference doc §12): a separate
 * administrative environment, entered from the profile/account menu — not a
 * permanent group inside the standard product sidebar (that group was
 * removed in Block 5). `/admin/layout.tsx` renders this in place of the
 * normal AppShell chrome (see bareMode.ts's `/admin` bare-route rule).
 *
 * Authorization here is a UI convenience only — every /admin page and
 * /api/admin/* route already re-checks accessLevel server-side independently
 * (reference doc §12: "Hiding the UI link alone is not security"); this
 * layout's own guard just keeps the admin chrome itself from flashing for a
 * non-admin who lands here directly.
 */
export default function AdminShell(props: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar
        groups={ADMIN_GROUPS}
        title="Guided Planning — Administration"
        titleHref="/admin"
        footer={
          <Link
            href="/home"
            className="block rounded-lg px-2 py-1.5 text-sm font-medium text-text-inverse-muted transition hover:bg-nav-hover hover:text-text-inverse"
          >
            ← Back to Workspace
          </Link>
        }
      />
      <main className="min-w-0 flex-1">{props.children}</main>
    </div>
  );
}
