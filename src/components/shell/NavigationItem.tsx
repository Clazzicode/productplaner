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
}

const ICONS: Record<string, string> = {
  Dashboard: "⌂", Projects: "□", Initiatives: "◎", Roadmap: "◇",
  "Planning Workspace": "▦", "Sprints & Releases": "▤", "Capacity & Cost": "▥",
  "Risks & Blockers": "△", Decisions: "▣", Reports: "▥",
  "Teams & Stakeholders": "♙", Integrations: "↗", Activity: "⌁",
};

function ItemLabel({ label }: { label: string }) {
  return <span className="flex items-center gap-3"><span aria-hidden className="w-5 text-center text-base text-[#b9c9ee]">{ICONS[label] ?? "·"}</span><span>{label}</span></span>;
}

export default function NavigationItem(props: NavigationItemProps) {
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

  const active = pathname === props.href || pathname.startsWith(`${props.href}/`);

  return (
    <Link
      href={props.href}
      className={`block rounded-lg px-2.5 py-2 text-sm font-medium transition ${
        active
          ? "bg-nav-selected text-text-inverse"
          : "text-text-inverse-muted hover:bg-nav-hover hover:text-text-inverse"
      }`}
    >
      <ItemLabel label={props.label} />
    </Link>
  );
}
