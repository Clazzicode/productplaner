"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { slug: "roadmap", label: "Roadmap" },
  { slug: "features", label: "Feature Hierarchy" },
  { slug: "epics", label: "Epics & Stories" },
  { slug: "sprints", label: "Sprints & Releases" },
  { slug: "capacity", label: "Capacity & Cost" },
  { slug: "executive", label: "Executive View" },
];

export default function NavTabs({ initiativeId }: { initiativeId: string }) {
  const pathname = usePathname();
  return (
    <nav className="no-print flex flex-wrap gap-1 border-b border-neutral-200">
      {TABS.map((tab) => {
        const href = `/initiatives/${initiativeId}/workspace/${tab.slug}`;
        const active = pathname?.startsWith(href);
        return (
          <Link
            key={tab.slug}
            href={href}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
              active
                ? "border border-b-0 border-neutral-200 bg-white text-indigo-700"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
