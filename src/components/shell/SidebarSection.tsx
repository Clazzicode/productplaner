"use client";
import { usePathname } from "next/navigation";
import NavigationItem, { type NavigationItemProps } from "./NavigationItem";
import type { SidebarSubgroup } from "./Sidebar";

type SectionItem = NavigationItemProps | SidebarSubgroup;

function isSubgroup(item: SectionItem): item is SidebarSubgroup {
  return "items" in item;
}

function isActive(item: NavigationItemProps, path: string) {
  return Boolean(item.href && (path === item.href || (!item.exact && path.startsWith(`${item.href}/`))));
}

export default function SidebarSection(props: { title: string; items: SectionItem[]; collapsible?: boolean }) {
  const path = usePathname() ?? "";
  const content = <ul className="mt-1.5 space-y-1">{props.items.map(item => <li key={item.label}>{isSubgroup(item) ? (
    <details open={item.items.some(child => isActive(child, path))} className="rounded-md border border-white/10">
      <summary className="cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-[#d7e0f3] hover:bg-nav-hover focus-visible:outline-2 focus-visible:outline-white">{item.label}</summary>
      <ul className="space-y-1 border-t border-white/10 p-1 pl-3">{item.items.map(child => <li key={child.label}><NavigationItem {...child} nested /></li>)}</ul>
    </details>
  ) : <NavigationItem {...item} />}</li>)}</ul>;
  if (props.collapsible) return <details open={props.items.some(item => isSubgroup(item) ? item.items.some(child => isActive(child, path)) : isActive(item, path))}>
    <summary className="cursor-pointer rounded px-2 py-2 text-xs font-bold uppercase tracking-wider text-[#91a7d0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{props.title}</summary>{content}
  </details>;
  return (
    <div className={props.title ? "" : "pt-3"}>
      {props.title && <p className="px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#91a7d0]">{props.title}</p>}
      {content}
    </div>
  );
}
