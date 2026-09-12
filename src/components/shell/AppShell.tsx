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
  const currentInitiative = props.initiatives.find((i) => i.id === currentId);

  const bare = isBareRoute(pathname, props.hasProfile, currentInitiative);

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
    <div className="flex items-center gap-3">
      {props.initiatives.length > 0 && (
        <select
          value={props.initiatives.some((i) => i.id === currentId) ? currentId : ""}
          onChange={(e) => switchInitiative(e.target.value)}
          className="max-w-64 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium focus:border-indigo-500 focus:outline-none"
        >
          <option value="" disabled>
            Switch initiative…
          </option>
          {props.initiatives.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
              {i.status !== "generated" ? " (intake)" : ""}
            </option>
          ))}
        </select>
      )}
      <Link
        href="/initiatives/new"
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        + New
      </Link>
    </div>
  );

  return (
    <div className="flex min-h-screen">
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
        <main className="min-w-0 flex-1">
          <div className="px-6 pt-4">
            <AiUsageBanner />
          </div>
          {props.children}
        </main>
      </div>
    </div>
  );
}
