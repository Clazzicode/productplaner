"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavInitiative {
  id: string;
  name: string;
  status: string; // draft | intake_in_progress | generated
}

interface NavItem {
  label: string;
  href: string | null; // null = disabled with explanation
  disabledReason?: string;
  activePrefix?: string;
}

/**
 * Persistent left navigation, grouped by the planning chain
 * (Product platform spec §1.1). Initiative-scoped links follow the
 * initiative in the current URL, falling back to the most recent one.
 */
export default function LeftNav(props: { initiatives: NavInitiative[] }) {
  const pathname = usePathname() ?? "";

  const urlMatch = pathname.match(/^\/initiatives\/([^/]+)/);
  const current =
    (urlMatch && props.initiatives.find((i) => i.id === urlMatch[1])) ??
    props.initiatives.find((i) => i.status === "generated") ??
    props.initiatives[0] ??
    null;
  const generated = current?.status === "generated";

  const scoped = (suffix: string, label: string): NavItem =>
    current && generated
      ? { label, href: `/initiatives/${current.id}/${suffix}` }
      : {
          label,
          href: null,
          disabledReason: current
            ? "Available once this initiative's plan is generated."
            : "Create an initiative first.",
        };

  const groups: { title: string; items: NavItem[] }[] = [
    {
      title: "Overview",
      items: [scoped("dashboard", "Dashboard"), { label: "Initiatives", href: "/home" }],
    },
    {
      title: "Planning",
      items: [
        current
          ? { label: "Guided Intake", href: `/initiatives/${current.id}/intake` }
          : { label: "Guided Intake", href: null, disabledReason: "Create an initiative first." },
        scoped("workspace/roadmap", "Roadmap"),
        scoped("workspace/features", "Features"),
        scoped("workspace/epics", "Epics & Stories"),
      ],
    },
    {
      title: "Execution",
      items: [
        scoped("workspace/sprints", "Sprints & Releases"),
        scoped("workspace/capacity", "Capacity & Cost"),
      ],
    },
    {
      title: "Outputs",
      items: [scoped("workspace/executive", "Executive Presentation")],
    },
    {
      title: "Tools",
      items: [{ label: "Integrations", href: "/integrations" }],
    },
  ];

  return (
    <nav className="no-print flex h-full w-56 shrink-0 flex-col gap-5 overflow-y-auto border-r border-neutral-200 bg-white px-3 py-5">
      <Link href="/home" className="px-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
          Guided Planning
        </span>
      </Link>
      {groups.map((group) => (
        <div key={group.title}>
          <p className="px-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
            {group.title}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {group.items.map((item) => {
              const active =
                item.href != null &&
                (pathname === item.href || pathname.startsWith(`${item.href}/`));
              return (
                <li key={item.label}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      className={`block rounded-lg px-2 py-1.5 text-sm font-medium transition ${
                        active
                          ? "bg-indigo-50 text-indigo-700"
                          : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                      }`}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span
                      title={item.disabledReason}
                      className="block cursor-not-allowed rounded-lg px-2 py-1.5 text-sm font-medium text-neutral-300"
                    >
                      {item.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
