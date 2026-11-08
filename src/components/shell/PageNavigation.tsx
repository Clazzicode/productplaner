"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import type { NavInitiative } from "./LeftNav";
import { pageNavigation } from "./navigationRoutes";
import { historySnapshot, serverHistorySnapshot, subscribeHistory } from "./navigationHistory";
import { confirmPageNavigation, useNavigationGuard } from "./unsavedChanges";

const sections = [["/home", "Home"], ["/projects", "Projects"], ["/initiatives", "Initiatives"], ["/teams", "Teams & Stakeholders"], ["/integrations", "Integrations"], ["/activity", "Activity"], ["/account/settings", "Account settings"]];

export default function PageNavigation({ initiatives, canManageWorkspace, signedIn }: { initiatives: NavInitiative[]; canManageWorkspace: boolean; signedIn: boolean }) {
  const path = usePathname() ?? "/home";
  const router = useRouter();
  const history = useSyncExternalStore(subscribeHistory, historySnapshot, serverHistorySnapshot);
  useNavigationGuard();
  const { parent, parentLabel, title } = pageNavigation(path, initiatives);
  const options = sections.filter(([href]) => href !== "/integrations" || canManageWorkspace);
  if (!signedIn || ["/login", "/reset-password"].includes(path) || path.endsWith("/executive/print")) return null;
  const control = "min-h-10 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-text-primary hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <nav aria-label="Page navigation" className="no-print border-b border-border-subtle bg-white px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!history.back} className={control} onClick={() => { if (confirmPageNavigation()) router.back(); }}>← Back</button>
        <button type="button" disabled={!history.forward} className={control} onClick={() => { if (confirmPageNavigation()) router.forward(); }}>Forward →</button>
        <Link href={parent} className={`${control} max-w-full truncate`} title={`Back to ${parentLabel}`}>↑ {parentLabel}</Link>
        <span aria-current="page" className="min-w-0 flex-1 truncate px-1 text-sm text-text-secondary">{title}</span>
        <label className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span>Go to</span>
          <select aria-label="Switch section" value="" className={`${control} max-w-56`} onChange={event => { const target = event.target.value; if (target && confirmPageNavigation()) router.push(target); }}>
            <option value="" disabled>Choose section…</option>
            {options.map(([href, label]) => <option key={href} value={href}>{label}</option>)}
            {canManageWorkspace && path.startsWith("/admin") && <option value="/admin">Administration</option>}
          </select>
        </label>
      </div>
    </nav>
  );
}
