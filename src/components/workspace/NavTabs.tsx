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
  const currentSlug = BASE_TABS.find((tab) => pathname?.includes(`/workspace/${tab.slug}`))?.slug;
  const visibleTabs = currentSlug === "features" || currentSlug === "epics" || currentSlug === "documents"
    ? BASE_TABS.filter((tab) => ["features", "epics", "documents"].includes(tab.slug))
    : currentSlug === "roadmap"
      ? BASE_TABS.filter((tab) => tab.slug === "roadmap")
      : currentSlug === "sprints"
        ? BASE_TABS.filter((tab) => tab.slug === "sprints")
        : [];
  if (visibleTabs.length === 0) return null;
  return (
    <nav className="no-print flex gap-7 overflow-x-auto no-scrollbar border-b border-border-subtle px-1">
      {visibleTabs.map((tab) => {
        const href = `/initiatives/${initiativeId}/workspace/${tab.slug}`;
        const active = pathname?.startsWith(href);
        return (
          <Link
            key={tab.slug}
            href={href}
            className={`shrink-0 border-b-2 px-1 py-3 text-sm font-semibold transition ${
              active
                ? "border-accent text-accent"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab.slug === "features"
              ? "Features"
              : tab.slug === "roadmap"
                ? "Timeline"
                : tab.slug === "sprints"
                  ? "Releases & Sprints"
                  : overrides[tab.slug] ?? tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
