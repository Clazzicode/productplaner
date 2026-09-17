"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const BASE_TABS = [
  { slug: "roadmap", label: "Roadmap" },
  { slug: "features", label: "Feature Hierarchy" },
  { slug: "epics", label: "Epics & Stories" },
  { slug: "sprints", label: "Sprints & Releases" },
  { slug: "capacity", label: "Capacity & Cost" },
  { slug: "executive", label: "Executive View" },
  // Directive item 2: "Add Documents" from inside the initiative workspace
  // — no entry point existed here before Document Import & Approved Context.
  { slug: "documents", label: "Documents" },
] as const;

// Cosmetic relabeling on top of the real per-methodology generation/locking
// differences — not a substitute for them.
const LABEL_OVERRIDES: Record<string, Partial<Record<(typeof BASE_TABS)[number]["slug"], string>>> = {
  agile_scrum: { roadmap: "Backlog" },
  kanban: { sprints: "Flow & Releases" },
};

/** Shared with WorkspaceBreadcrumb so the two never drift on tab naming. */
export function currentTabLabel(pathname: string | null, methodology?: string): string | null {
  const overrides = LABEL_OVERRIDES[methodology ?? ""] ?? {};
  const match = BASE_TABS.find((tab) => pathname?.includes(`/workspace/${tab.slug}`));
  return match ? (overrides[match.slug] ?? match.label) : null;
}

export default function NavTabs({
  initiativeId,
  methodology,
}: {
  initiativeId: string;
  methodology?: string;
}) {
  const pathname = usePathname();
  const overrides = LABEL_OVERRIDES[methodology ?? ""] ?? {};
  return (
    <nav className="no-print flex gap-1 overflow-x-auto no-scrollbar border-b border-neutral-200">
      {BASE_TABS.map((tab) => {
        const href = `/initiatives/${initiativeId}/workspace/${tab.slug}`;
        const active = pathname?.startsWith(href);
        return (
          <Link
            key={tab.slug}
            href={href}
            className={`shrink-0 rounded-t-lg px-4 py-2 text-sm font-medium transition ${
              active
                ? "border border-b-0 border-neutral-200 bg-white text-indigo-700"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {overrides[tab.slug] ?? tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
