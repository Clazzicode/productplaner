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
 * ADMIN is rendered unconditionally, every item disabled — there is no real
 * `accessLevel` to gate on yet (docs/V2-ARCHITECTURE.md §10). This is
 * presentation only, never authorization; do not treat it as a permission check.
 *
 * Implementation note (Step 7B — docs/V2-STANDARD-DASHBOARD.md): "Dashboard" now
 * points at the global Standard Dashboard (`/home`), not the current initiative's
 * dashboard — superseding the Step 6C "Dashboard Interim Behavior" note in
 * docs/V2-SHELL-COHESION-QA.md. The initiative list moved to `/initiatives` so
 * "Initiatives" could keep its own destination.
 */
export default function LeftNav(props: { initiatives: NavInitiative[] }) {
  const pathname = usePathname() ?? "";

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
        { label: "Teams & Stakeholders", href: null, disabledReason: NOT_YET_AVAILABLE },
        { label: "Integrations", href: "/integrations" },
        { label: "Activity", href: null, disabledReason: NOT_YET_AVAILABLE },
      ],
    },
    {
      title: "Admin",
      items: [
        { label: "Users & Roles", href: null, disabledReason: NOT_YET_AVAILABLE },
        { label: "Organization", href: null, disabledReason: NOT_YET_AVAILABLE },
        { label: "Dashboard Configuration", href: null, disabledReason: NOT_YET_AVAILABLE },
        { label: "Settings", href: null, disabledReason: NOT_YET_AVAILABLE },
      ],
    },
  ];

  return <Sidebar groups={groups} />;
}
