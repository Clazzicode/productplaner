"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import AccountMenu from "@/components/auth/AccountMenu";
import AiUsageBanner from "@/components/ai/AiUsageBanner";
import { isBareRoute } from "./bareMode";
import LeftNav, { type NavInitiative } from "./LeftNav";
import MobileNavDrawer from "./MobileNavDrawer";
import TopHeader from "./TopHeader";
import ChevronIcon from "@/components/ui/ChevronIcon";
import { confirmPageNavigation, useNavigationGuard } from "./unsavedChanges";

/**
 * Persistent app chrome (left nav + top bar). Rendered from the root layout;
 * skips itself on the pre-qualification screens and the print route so those
 * flows stay full-bleed. No existing routes moved — chrome is purely additive.
 *
 * Below `xl:` the persistent sidebar becomes a hamburger-triggered drawer.
 * This keeps a useful workspace width on tablets and narrow desktop windows.
 */
export default function AppShell(props: {
  signedIn: boolean;
  canManageWorkspace?: boolean;
  userName: string;
  accessLevel: string;
  initiatives: NavInitiative[];
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  useNavigationGuard();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Adjusting state during render (not in an effect) when a value the
  // component reads — pathname — changes: React's documented pattern for
  // this, avoids an extra commit/cascading-render pass. Hooks must run
  // unconditionally before the `bare` early return below.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setDrawerOpen(false);
  }

  const urlMatch = pathname.match(/^\/initiatives\/([^/]+)/);
  const currentId = urlMatch?.[1] ?? "";
  const routeInitiative = props.initiatives.find((i) => i.id === currentId);
  const currentInitiative =
    routeInitiative ??
    props.initiatives[0];
  const projects = Array.from(new Map(props.initiatives.filter(row => row.project).map(row => [row.project!.id, row.project!])).values());
  const routeProjectId = pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const selectedProject = projects.find(project => project.id === routeProjectId) ?? currentInitiative?.project ?? undefined;
  const home = pathname === "/home";
  const roadmap = /^\/initiatives\/[^/]+\/workspace\/roadmap\/?$/.test(pathname);
  const demoDetail = /^\/initiatives\/[^/]+\/workspace\/demos\/[^/]+(?:\/(?:google-meet|zoom))?\/?$/.test(pathname);

  const bare = isBareRoute(pathname, props.signedIn, routeInitiative);

  if (bare) {
    return props.children;
  }

  const switchInitiative = (id: string) => {
    const target = props.initiatives.find((i) => i.id === id);
    if (!target || !confirmPageNavigation()) return;
    router.push(
      `/initiatives/${id}/overview`,
    );
  };

  const switcherAndNew = (
    <div className="flex min-w-0 items-end gap-3">
      {currentInitiative?.project && (
        <Link
          href={`/projects/${currentInitiative.project.id}`}
          className="hidden min-w-52 rounded-lg border border-[#d4def1] bg-white px-3 py-2 text-sm font-semibold text-text-primary shadow-sm xl:block"
        >
          <span className="mb-1 block text-[10px] font-medium text-text-muted">Project</span>
          <span className="block max-w-56 truncate">▣ &nbsp;{currentInitiative.project.name}</span>
        </Link>
      )}
      {props.initiatives.length > 0 && (
        <label className="min-w-0 xl:min-w-80">
          <span className="mb-1 block text-[10px] font-medium text-text-muted">Initiative</span>
          <select
            value={currentInitiative?.id ?? ""}
            onChange={(e) => switchInitiative(e.target.value)}
            className="w-full max-w-96 rounded-lg border border-[#d4def1] bg-white px-3 py-2 text-sm font-semibold text-text-primary shadow-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="" disabled>Switch initiative…</option>
            {props.initiatives.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}{i.status !== "generated" ? " (intake)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {currentInitiative && props.canManageWorkspace && (
        <Link
          href="/integrations"
          className="hidden h-[38px] items-center gap-2 rounded-lg border border-[#d4def1] bg-white px-3 text-sm font-semibold text-text-primary shadow-sm md:flex"
        >
          <span className="text-[#315cff]">◆</span>
          Jira integration
        </Link>
      )}
      {props.canManageWorkspace && <Link
        href="/initiatives/new"
        className="hidden h-[38px] items-center rounded-lg bg-accent px-3 text-sm font-semibold text-white shadow-sm hover:bg-accent-hover 2xl:flex"
      >
        + New initiative
      </Link>}
    </div>
  );

  const createActions = props.canManageWorkspace ? (
    <details className="group relative">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-md bg-[#5145ed] px-4 text-sm font-medium text-white shadow-[0_2px_5px_rgba(81,69,237,0.2)] hover:bg-[#4238d7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5145ed]">Create <ChevronIcon direction="down" size={13} /></summary>
      <div className="absolute right-0 z-50 mt-2 w-44 rounded-xl border border-border-subtle bg-white p-1.5 text-text-primary shadow-xl">
        <Link href="/projects/new" className="block rounded-lg px-3 py-2 text-sm hover:bg-[#f4f5fe]">New project</Link>
        <Link href="/initiatives/new" className="block rounded-lg px-3 py-2 text-sm hover:bg-[#f4f5fe]">New initiative</Link>
      </div>
    </details>
  ) : null;

  return (
    <div className="flex min-h-dvh w-full min-w-0 bg-surface">
      <div className={roadmap ? "hidden min-[851px]:contents" : "hidden xl:contents"}>
        <LeftNav initiatives={props.initiatives} canManageWorkspace={props.canManageWorkspace} />
      </div>
      <MobileNavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        initiatives={props.initiatives}
        canManageWorkspace={props.canManageWorkspace}
        topContent={switcherAndNew}
        bottomContent={<AccountMenu userName={props.userName} accessLevel={props.accessLevel} dropUp />}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader
          createActions={createActions}
          accountActions={<AccountMenu userName={props.userName} accessLevel={props.accessLevel} />}
          userName={props.userName}
          onOpenMenu={() => setDrawerOpen(true)}
          roadmap={roadmap}
          requestHref={currentInitiative ? `/initiatives/${currentInitiative.id}/requests` : undefined}
          featureHref={currentInitiative ? `/initiatives/${currentInitiative.id}/backlog` : undefined}
          project={selectedProject}
          projects={projects}
        />
        <main className={`min-w-0 flex-1 ${home ? "bg-white" : "bg-[#f4f5fe]"}`}>
          <div className={roadmap || demoDetail ? "px-0 pt-0" : "px-4 pt-4 sm:px-6"}>
            <AiUsageBanner />
          </div>
          {props.children}
        </main>
      </div>
    </div>
  );
}
