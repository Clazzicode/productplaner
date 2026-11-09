"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Guided-activation restructure (reference doc §11): a disabled nav item is
 * either lifecycle-gated (real prerequisite, a real unlock action exists —
 * `cta` set) or genuinely not-yet-built (no `cta` — plain "not yet
 * available," never implies a path forward that doesn't exist).
 */
export interface NavDisabledState {
  reason: string;
  cta?: { label: string; href: string };
}

export interface NavigationItemProps {
  label: string;
  /** null = disabled — see `disabled` for why and whether it's unlockable. */
  href: string | null;
  disabled?: NavDisabledState;
  exact?: boolean;
}

const ICONS: Record<string, string> = {
  Dashboard: "⌂", Projects: "□", Initiatives: "◎", Roadmap: "◇",
  "Planning Workspace": "▦", "Requests & Priorities": "▧", "Sprints & Releases": "▤", "Capacity & Cost": "▥",
  Demos: "▷",
  "Risks & Blockers": "△", Decisions: "▣", Reports: "▥",
  "Teams & Stakeholders": "♙", Integrations: "↗", Activity: "⌁",
};

const HOME_ICONS: Record<string, React.ReactNode> = {
  Home: <><path d="m3 10 9-7 9 7v10H3V10Z"/><path d="M9 20v-7h6v7"/></>,
  Requests: <><path d="M3 8h18l-2 12H5L3 8Z"/><path d="M7 8V4h10v4m-8 5h6"/></>,
  Features: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  Roadmap: <><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M8 9v11m5-7h5m-5 4h3"/></>,
  Delivery: <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,
  Insights: <><path d="M4 20V10h4v10M10 20V5h4v15m2 0v-8h4v8M2 20h20"/></>,
};

function ItemLabel({ label }: { label: string }) {
  return <span className="flex items-center gap-3"><span aria-hidden className="grid w-5 place-items-center text-center text-base text-[#b9c9ee]">{HOME_ICONS[label] ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{HOME_ICONS[label]}</svg> : ICONS[label] ?? "·"}</span><span>{label}</span></span>;
}

export default function NavigationItem(props: NavigationItemProps & { nested?: boolean }) {
  const pathname = usePathname() ?? "";

  if (!props.href) {
    const cta = props.disabled?.cta;
    if (cta) {
      // Lifecycle-gated with a real unlock path: the whole item is a link to
      // that action, with a small subtitle explaining what it unlocks —
      // never an unexplained gray dead end (reference doc §11).
      return (
        <Link
          href={cta.href}
          title={props.disabled?.reason}
          className="block rounded-lg px-2 py-1.5 transition hover:bg-nav-hover"
        >
          <span className="block text-sm font-medium text-text-inverse-muted"><ItemLabel label={props.label} /></span>
          <span className="block text-[10px] leading-tight text-text-inverse-muted/70">{cta.label}</span>
        </Link>
      );
    }
    return (
      <span
        title={props.disabled?.reason}
        className="block cursor-not-allowed rounded-lg px-2.5 py-2 text-sm font-medium text-text-inverse-muted opacity-50"
      >
        <ItemLabel label={props.label} />
      </span>
    );
  }

  const active = pathname === props.href || (!props.exact && pathname.startsWith(`${props.href}/`));

  return (
    <Link
      href={props.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center rounded-md px-3 py-2 transition ${props.nested ? "min-h-8 text-[13px]" : "min-h-10 text-sm"} ${active ? "font-semibold" : "font-normal"} ${
        active
          ? "bg-gradient-to-r from-[#5c55f7] to-[#4b45e8] text-white"
          : "text-[#d7e0f3] hover:bg-nav-hover hover:text-white"
      }`}
    >
      <ItemLabel label={props.label} />
    </Link>
  );
}
