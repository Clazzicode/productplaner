"use client";

import { usePathname } from "next/navigation";
import NavigationItem, { type NavigationItemProps } from "./NavigationItem";
import Sidebar, { type SidebarGroup } from "./Sidebar";

export interface NavInitiative {
  id: string;
  name: string;
  status: string;
  canEdit?: boolean;
  hasWorkspace?: boolean;
  project: { id: string; name: string } | null;
  syncConnections: { status: string }[];
}

/** One workflow for every account; only actual permissions filter destinations. */
export default function LeftNav(props: { initiatives: NavInitiative[]; canManageWorkspace?: boolean }) {
  const pathname = usePathname() ?? "";
  const match = pathname.match(/^\/initiatives\/([^/]+)/);
  const current = (match && props.initiatives.find(row => row.id === match[1])) || props.initiatives[0] || null;
  const scoped = (suffix: string, label: string): NavigationItemProps => current
    ? { label, href: `/initiatives/${current.id}/${suffix}` }
    : { label, href: null, disabled: { reason: "Select or create an initiative first.", cta: { label: "Open initiatives", href: "/initiatives" } } };
  const groups: SidebarGroup[] = [
    { title: "", items: [{ label: "Home", href: "/home" }, { label: "Projects", href: "/projects" }, scoped("overview", "Five-tool guide")] },
    { title: "Plan", collapsible: true, items: [
      { label: "Initiatives", items: [
        { label: "All initiatives", href: "/initiatives", exact: true },
        ...(props.canManageWorkspace ? [{ label: "New initiative", href: "/initiatives/new" }] : []),
        scoped("intake", "Initiative brief"),
      ] },
      scoped("requests", "Requests & Priorities"), scoped("backlog", "Features & Backlog"),
      scoped("workspace/epics", "Stories & Criteria"), scoped("workspace/refinement", "Refinement"),
      scoped("workspace/roadmap", "Roadmap"), scoped("workspace/documents", "Documents"),
      ...(current?.canEdit ? [scoped("workspace/regeneration", "Review regeneration")] : []),
      scoped("workspace/features", "Feature hierarchy"), { label: "Teams & Stakeholders", href: "/teams" },
      ...(props.canManageWorkspace ? [{ label: "Integrations", href: "/integrations" }] : []),
    ] },
    { title: "Deliver", collapsible: true, items: [
      { label: "Sprint", items: [scoped("workspace/sprint-preparation", "Sprint Planning"),
        scoped("workspace/sprints", "Sprints & Releases"), scoped("workspace/sprint-review", "Sprint Review")] },
      scoped("workspace/demos", "Demos"), scoped("workspace/validation", "PO Validation"),
      scoped("workspace/capacity", "Capacity & Cost"), scoped("workspace/release-readiness", "Release Readiness"),
    ] },
    { title: "Learn", collapsible: true, items: [
      scoped("workspace/feedback", "Feedback"), { label: "Risks & Blockers", href: "/risks" },
      { label: "Decisions", href: "/decisions" }, { label: "Activity", href: "/activity" },
      scoped("workspace/matrix", "Matrix Portal"), scoped("workspace/executive", "Reports"),
    ] },
  ];
  const roadmapMode = /^\/initiatives\/[^/]+\/workspace\/roadmap\/?$/.test(pathname);
  return <Sidebar groups={groups} compact={roadmapMode} footer={<NavigationItem label="Account settings" href="/account/settings" />} />;
}
