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

/**
 * Persistent app chrome (left nav + top bar). Rendered from the root layout;
 * skips itself on the pre-qualification screens and the print route so those
 * flows stay full-bleed. No existing routes moved — chrome is purely additive.
 *
 * Below `lg:` the persistent sidebar becomes a hamburger-triggered
 * MobileNavDrawer instead — covers phones and tablet-portrait, where a fixed
 * 224px sidebar would eat over half the screen.
 */
export default function AppShell(props: {
  hasProfile: boolean;
  userName: string;
  accessLevel: string;
  initiatives: NavInitiative[];
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
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
    props.initiatives.find((i) => i.status === "generated") ??
    props.initiatives[0];

  const bare = isBareRoute(pathname, props.hasProfile, routeInitiative);

  if (bare) {
    return props.children;
  }

  const currentName = currentInitiative?.name ?? "Guided Planning";

  const switchInitiative = (id: string) => {
    const target = props.initiatives.find((i) => i.id === id);
    if (!target) return;
    router.push(
      target.status === "generated" ? `/initiatives/${id}/dashboard` : `/initiatives/${id}/intake`,
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
      {currentInitiative && (
        <Link
          href="/integrations"
          className="hidden h-[38px] items-center gap-2 rounded-lg border border-[#d4def1] bg-white px-3 text-sm font-semibold text-text-primary shadow-sm md:flex"
        >
          <span className="text-[#315cff]">◆</span>
          {currentInitiative.syncConnections[0]?.status === "connected" ? (
            <><span className="h-2 w-2 rounded-full bg-emerald-500" /> Connected to Jira</>
          ) : "Connect Jira"}
        </Link>
      )}
      <Link
        href="/initiatives/new"
        className="hidden h-[38px] items-center rounded-lg bg-accent px-3 text-sm font-semibold text-white shadow-sm hover:bg-accent-hover 2xl:flex"
      >
        + New initiative
      </Link>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-surface">
      <div className="hidden lg:contents">
        <LeftNav initiatives={props.initiatives} />
      </div>
      <MobileNavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        initiatives={props.initiatives}
        topContent={switcherAndNew}
        bottomContent={<AccountMenu userName={props.userName} accessLevel={props.accessLevel} dropUp />}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader
          switcherAndNew={switcherAndNew}
          accountActions={<AccountMenu userName={props.userName} accessLevel={props.accessLevel} />}
          currentName={currentName}
          userName={props.userName}
          onOpenMenu={() => setDrawerOpen(true)}
        />
        <main className="min-w-0 flex-1 bg-[radial-gradient(circle_at_82%_0%,#edf1ff_0,transparent_30%)]">
          <div className="px-6 pt-4">
            <AiUsageBanner />
          </div>
          {props.children}
        </main>
      </div>
    </div>
  );
}
