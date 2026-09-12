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
 * (PLAN / INTELLIGENCE / ORGANIZATION). Initiative-scoped links follow the
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
 * Guided-activation restructure (reference doc §10/§11, Block 5): two real
 * changes from the previous flat version. First, progressive disclosure — a
 * user with no initiative at all sees a minimal nav (Home, Initiatives,
 * "Create Your First Plan," Organization) instead of five-sixths of the
 * platform rendered as unexplained gray dead ends. Second, once an initiative
 * exists, a lifecycle-locked item (Roadmap/Planning Workspace/Sprints &
 * Releases/Capacity & Cost/Reports, before the plan is generated) carries the
 * resolver's real unlock action instead of a bare disabled tooltip — see
 * NavigationItem's `disabled.cta`. Genuinely unbuilt items (Risks & Blockers,
 * Decisions, Activity) keep the plain "not yet available" treatment: no `cta`,
 * because no unlock path exists to offer.
 *
 * The ADMIN group that used to live here has moved to the profile/account
 * menu (Block 6) — administrative navigation no longer occupies permanent
 * space in the standard product sidebar (reference doc §12).
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
      : current
        ? {
            label,
            href: null,
            disabled: {
              reason: "Available once this initiative's plan has been generated.",
              cta: { label: "Generate Plan", href: `/initiatives/${current.id}/intake` },
            },
          }
        : {
            label,
            href: null,
            disabled: {
              reason: "Create an initiative first.",
              cta: { label: "Create Initiative", href: "/initiatives/new" },
            },
          };

  const groups: { title: string; items: NavigationItemProps[] }[] = current
    ? [
        {
          title: "Plan",
          items: [
            { label: "Dashboard", href: "/home" },
            { label: "Projects", href: "/projects" },
            { label: "Initiatives", href: "/initiatives" },
            scoped("workspace/roadmap", "Roadmap"),
            scoped("workspace/features", "Planning Workspace"),
            scoped("workspace/sprints", "Sprints & Releases"),
          ],
        },
        {
          title: "Intelligence",
          items: [
            { label: "Risks & Blockers", href: null, disabled: { reason: NOT_YET_AVAILABLE } },
            { label: "Decisions", href: null, disabled: { reason: NOT_YET_AVAILABLE } },
            scoped("workspace/capacity", "Capacity & Cost"),
            scoped("workspace/executive", "Reports"),
          ],
        },
        {
          title: "Organization",
          items: [
            { label: "Teams & Stakeholders", href: "/teams" },
            { label: "Integrations", href: "/integrations" },
            { label: "Activity", href: null, disabled: { reason: NOT_YET_AVAILABLE } },
          ],
        },
      ]
    : [
        {
          title: "Plan",
          items: [
            { label: "Dashboard", href: "/home" },
            { label: "Projects", href: "/projects" },
            { label: "Initiatives", href: "/initiatives" },
          ],
        },
        {
          title: "Setup",
          items: [{ label: "Create Your First Plan", href: "/initiatives/new" }],
        },
        {
          title: "Organization",
          items: [
            { label: "Teams & Stakeholders", href: "/teams" },
            { label: "Integrations", href: "/integrations" },
          ],
        },
      ];

  return <Sidebar groups={groups} />;
}
