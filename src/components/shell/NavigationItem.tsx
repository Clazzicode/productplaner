"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavigationItemProps {
  label: string;
  /** null = disabled — show `disabledReason` as a tooltip instead of a link. */
  href: string | null;
  disabledReason?: string;
}

export default function NavigationItem(props: NavigationItemProps) {
  const pathname = usePathname() ?? "";

  if (!props.href) {
    return (
      <span
        title={props.disabledReason}
        className="block cursor-not-allowed rounded-lg px-2 py-1.5 text-sm font-medium text-text-inverse-muted opacity-50"
      >
        {props.label}
      </span>
    );
  }

  const active = pathname === props.href || pathname.startsWith(`${props.href}/`);

  return (
    <Link
      href={props.href}
      className={`block rounded-lg px-2 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-nav-selected text-text-inverse"
          : "text-text-inverse-muted hover:bg-nav-hover hover:text-text-inverse"
      }`}
    >
      {props.label}
    </Link>
  );
}
