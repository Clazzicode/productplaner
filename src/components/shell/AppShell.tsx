"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DemoModeProvider } from "@/components/demo/DemoModeContext";
import DemoModeToggle from "@/components/demo/DemoModeToggle";
import LeftNav, { type NavInitiative } from "./LeftNav";

/**
 * Persistent app chrome (left nav + top bar). Rendered from the root layout;
 * skips itself on the pre-qualification screens and the print route so those
 * flows stay full-bleed. No existing routes moved — chrome is purely additive.
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

  const switchInitiative = (id: string) => {
    const target = props.initiatives.find((i) => i.id === id);
    if (!target) return;
    router.push(
      target.status === "generated" ? `/initiatives/${id}/dashboard` : `/initiatives/${id}/intake`,
    );
  };

  return (
    <DemoModeProvider initialEnabled={props.demoModeEnabled}>
      <div className="flex min-h-screen">
        <LeftNav initiatives={props.initiatives} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print flex items-center justify-between gap-4 border-b border-neutral-200 bg-white px-6 py-3">
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
            <div className="flex items-center gap-3">
              <DemoModeToggle />
              <span className="hidden items-center gap-2 text-sm text-neutral-500 sm:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                  {props.userName.slice(0, 1).toUpperCase()}
                </span>
                {props.userName}
              </span>
            </div>
          </header>
          <main className="min-w-0 flex-1">{props.children}</main>
        </div>
      </div>
    </DemoModeProvider>
  );
}
