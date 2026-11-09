"use client";

import { usePathname } from "next/navigation";
import type { NavigationItemProps } from "./NavigationItem";
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
    { title: "Start", items: [{ label: "Home", href: "/home" }, { label: "Projects", href: "/projects" }, { label: "Initiatives", href: "/initiatives" },
      ...(current ? [scoped("overview", "Five-tool guide")] : []), ...(props.canManageWorkspace ? [{ label: "New initiative", href: "/initiatives/new" }] : [])] },
    { title: "Planning", collapsible: true, items: [scoped("intake", "Initiative"), scoped("backlog", "Features & Backlog"), scoped("workspace/epics", "Stories & Criteria"),
      scoped("workspace/refinement", "Refinement"), scoped("workspace/roadmap", "Roadmap"), scoped("requests", "Requests & Priorities"),
      scoped("workspace/documents", "Documents"), scoped("workspace/feedback", "Feedback"), ...(current?.canEdit ? [scoped("workspace/regeneration", "Review regeneration")] : [])] },
    { title: "Delivery", collapsible: true, items: [scoped("workspace/sprint-preparation", "Sprint Planning"), scoped("workspace/sprints", "Sprints & Releases"),
      scoped("workspace/demos", "Demos"), scoped("workspace/sprint-review", "Sprint Review"), scoped("workspace/validation", "PO Validation"),
      scoped("workspace/release-readiness", "Release Readiness"), scoped("workspace/capacity", "Capacity & Cost")] },
    { title: "Workspace", collapsible: true, items: [{ label: "Teams & Stakeholders", href: "/teams" },
      ...(props.canManageWorkspace ? [{ label: "Integrations", href: "/integrations" }] : []), { label: "Risks & Blockers", href: "/risks" },
      { label: "Decisions", href: "/decisions" }, { label: "Activity", href: "/activity" }, scoped("workspace/features", "Feature hierarchy"),
      scoped("workspace/matrix", "Matrix Portal"), scoped("workspace/executive", "Reports"), { label: "Account settings", href: "/account/settings" }] },
  ];
  if (pathname === "/home") {
    const quick: SidebarGroup = { title: "", items: [
      { label: "Home", href: "/home" },
      scoped("requests", "Requests"),
      scoped("backlog", "Features"),
      scoped("workspace/roadmap", "Roadmap"),
      scoped("workspace/sprints", "Delivery"),
      scoped("workspace/executive", "Insights"),
    ] };
    const allTools = groups.map(group => ({
      ...group,
      collapsible: true,
      items: group.items.filter(item => item.href !== "/home"),
    }));
    return <Sidebar groups={[quick, ...allTools]} homeMode />;
  }
  return <Sidebar groups={groups} />;
}
