"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { DemoModeProvider } from "@/components/demo/DemoModeContext";
import DemoModeToggle from "@/components/demo/DemoModeToggle";
import StartOverButton from "@/components/demo/StartOverButton";
import LeftNav, { type NavInitiative } from "./LeftNav";
import MobileNavDrawer from "./MobileNavDrawer";

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
  initiatives: NavInitiative[];
  demoModeEnabled: boolean;
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

  const bare =
    !props.hasProfile ||
    pathname === "/" ||
    pathname.startsWith("/welcome") ||
    pathname.endsWith("/executive/print");

  if (bare) {
    return <DemoModeProvider initialEnabled={props.demoModeEnabled}>{props.children}</DemoModeProvider>;
  }

  const urlMatch = pathname.match(/^\/initiatives\/([^/]+)/);
  const currentId = urlMatch?.[1] ?? "";
  const currentName = props.initiatives.find((i) => i.id === currentId)?.name ?? "Guided Planning";

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

  const accountActions = (
    <div className="flex items-center gap-3">
      <DemoModeToggle />
      <StartOverButton />
      <span className="hidden items-center gap-2 text-sm text-neutral-500 sm:flex">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
          {props.userName.slice(0, 1).toUpperCase()}
        </span>
        {props.userName}
      </span>
    </div>
  );

  return (
    <DemoModeProvider initialEnabled={props.demoModeEnabled}>
      <div className="flex min-h-screen">
        <div className="hidden lg:contents">
          <LeftNav initiatives={props.initiatives} />
        </div>
        <MobileNavDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          initiatives={props.initiatives}
          topContent={switcherAndNew}
          bottomContent={accountActions}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print hidden items-center justify-between gap-4 border-b border-neutral-200 bg-white px-6 py-3 lg:flex">
            {switcherAndNew}
            {accountActions}
          </header>
          <header className="no-print flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3 lg:hidden">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="shrink-0 rounded-lg p-1.5 text-neutral-600 hover:bg-neutral-100"
            >
              <span className="block h-0.5 w-5 bg-current" />
              <span className="mt-1 block h-0.5 w-5 bg-current" />
              <span className="mt-1 block h-0.5 w-5 bg-current" />
            </button>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-800">
              {currentName}
            </span>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
              {props.userName.slice(0, 1).toUpperCase()}
            </span>
          </header>
          <main className="min-w-0 flex-1">{props.children}</main>
        </div>
      </div>
    </DemoModeProvider>
  );
}
