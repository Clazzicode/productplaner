"use client";

import { usePathname } from "next/navigation";
import type { NavigationItemProps } from "./NavigationItem";
import Sidebar from "./Sidebar";

export interface NavInitiative {
  id: string;
  name: string;
  status: string; // draft | intake_in_progress | generated
}

const NOT_YET_AVAILABLE = "Not yet available.";

/**
 * Persistent left navigation, grouped per docs/V2-APPLICATION-SHELL-BLUEPRINT.md §2
 * (PLAN / INTELLIGENCE / ORGANIZATION / ADMIN). Initiative-scoped links follow the
 * initiative in the current URL, falling back to the most recent one.
 *
 * "Guided Intake" and "Epics & Stories" — present in the old flat nav — are
 * deliberately not top-level items here: Epics & Stories is already reachable via
 * NavTabs on every workspace page, and Guided Intake is reachable via the
 * "view intake answers" link already in workspace/layout.tsx's header on every
 * workspace page. See docs/V2-DESIGN-SYSTEM.md "Focused-Flow Exclusions".
 *
 * Implementation note (Step 7B — docs/V2-STANDARD-DASHBOARD.md): "Dashboard" now
 * points at the global Standard Dashboard (`/home`), not the current initiative's
 * dashboard — superseding the Step 6C "Dashboard Interim Behavior" note in
 * docs/V2-SHELL-COHESION-QA.md. The initiative list moved to `/initiatives` so
 * "Initiatives" could keep its own destination.
 *
 * Implementation note (Step 8B — docs/V2-USERS-TEAMS.md): `User.accessLevel` is
 * now real and persisted, so "Users" is gated on it (real, if narrow, server-side
 * enforcement lives in the /api/admin/* routes themselves — this nav gate is
 * still just presentation, per Step 7A's "never only by hiding UI" rule). "Teams
 * & Stakeholders" is real for every viewer (admin-aware, not admin-only — see
 * docs/V2-ORG-ADMIN-IA.md §2).
 *
 * Implementation note (Step 8C — docs/V2-RESOURCE-ACCESS.md): "Access" is now
 * real too, gated the same way as "Users". "Organization" and "Dashboard
 * Configuration" remain disabled placeholders — those routes don't exist yet.
 *
 * Implementation note (Step 8D — docs/V2-ORG-ADMIN-DASHBOARD.md): "Dashboard"
 * is the ADMIN group's new first item, pointing at `/admin` (the
 * organization-wide control center) — gated identically to "Users"/"Access".
 * Distinct from the Plan group's "Dashboard" above, which is the Standard
 * User's personal `/home`.
 *
 * Implementation note (Step 8E — docs/V2-DASHBOARD-CONFIGURATION.md):
 * "Dashboard Configuration" is now real too, gated the same way as
 * "Dashboard"/"Users"/"Access". "Organization" and "Settings" remain
 * disabled placeholders — those routes still don't exist.
 */
export default function LeftNav(props: { initiatives: NavInitiative[]; accessLevel: string }) {
  const pathname = usePathname() ?? "";
  const isOrgAdmin = props.accessLevel === "org_admin";

  const urlMatch = pathname.match(/^\/initiatives\/([^/]+)/);
  const current =
    (urlMatch && props.initiatives.find((i) => i.id === urlMatch[1])) ??
    props.initiatives.find((i) => i.status === "generated") ??
    props.initiatives[0] ??
    null;
  const generated = current?.status === "generated";

  const scoped = (suffix: string, label: string): NavigationItemProps =>
    current && generated
      ? { label, href: `/initiatives/${current.id}/${suffix}` }
      : {
          label,
          href: null,
          disabledReason: current
            ? "Available once this initiative's plan is generated."
            : "Create an initiative first.",
        };

  const groups: { title: string; items: NavigationItemProps[] }[] = [
    {
      title: "Plan",
      items: [
        { label: "Dashboard", href: "/home" },
        { label: "Initiatives", href: "/initiatives" },
        scoped("workspace/roadmap", "Roadmap"),
        scoped("workspace/features", "Planning Workspace"),
        scoped("workspace/sprints", "Sprints & Releases"),
      ],
    },
    {
      title: "Intelligence",
      items: [
        { label: "Risks & Blockers", href: null, disabledReason: NOT_YET_AVAILABLE },
        { label: "Decisions", href: null, disabledReason: NOT_YET_AVAILABLE },
        scoped("workspace/capacity", "Capacity & Cost"),
        scoped("workspace/executive", "Reports"),
      ],
    },
    {
      title: "Organization",
      items: [
        { label: "Teams & Stakeholders", href: "/teams" },
        { label: "Integrations", href: "/integrations" },
        { label: "Activity", href: null, disabledReason: NOT_YET_AVAILABLE },
      ],
    },
    {
      title: "Admin",
      items: [
        isOrgAdmin
          ? { label: "Dashboard", href: "/admin" }
          : { label: "Dashboard", href: null, disabledReason: "Organization Admin only." },
        isOrgAdmin
          ? { label: "Users", href: "/admin/users" }
          : { label: "Users", href: null, disabledReason: "Organization Admin only." },
        isOrgAdmin
          ? { label: "Access", href: "/admin/access" }
          : { label: "Access", href: null, disabledReason: "Organization Admin only." },
        isOrgAdmin
          ? { label: "Dashboard Configuration", href: "/admin/dashboard-configuration" }
          : { label: "Dashboard Configuration", href: null, disabledReason: "Organization Admin only." },
        { label: "Organization", href: null, disabledReason: NOT_YET_AVAILABLE },
        { label: "Settings", href: null, disabledReason: NOT_YET_AVAILABLE },
      ],
    },
  ];

  return <Sidebar groups={groups} />;
}
