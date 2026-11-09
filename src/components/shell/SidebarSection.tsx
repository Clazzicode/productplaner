"use client";
import { usePathname } from "next/navigation";
import NavigationItem, { type NavigationItemProps } from "./NavigationItem";

export default function SidebarSection(props: { title: string; items: NavigationItemProps[]; collapsible?: boolean }) {
  const path = usePathname() ?? "";
  const content = <ul className="mt-1.5 space-y-1">{props.items.map(item => <li key={item.label}><NavigationItem {...item} /></li>)}</ul>;
  if (props.collapsible) return <details open={props.items.some(item => item.href && (path === item.href || path.startsWith(`${item.href}/`)))}>
    <summary className="cursor-pointer rounded px-2 py-2 text-xs font-bold uppercase tracking-wider text-[#91a7d0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{props.title}</summary>{content}
  </details>;
  return (
    <div className={props.title ? "" : "pt-3"}>
      {props.title && <p className="px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#91a7d0]">{props.title}</p>}
      {content}
    </div>
  );
}
