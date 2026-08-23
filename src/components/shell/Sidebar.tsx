import Link from "next/link";
import type { NavigationItemProps } from "./NavigationItem";
import SidebarSection from "./SidebarSection";

export default function Sidebar(props: { groups: { title: string; items: NavigationItemProps[] }[] }) {
  return (
    <nav className="no-print flex h-full w-56 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border-nav bg-nav px-3 py-5">
      <Link href="/home" className="px-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-text-inverse">
          Guided Planning
        </span>
      </Link>
      {props.groups.map((group) => (
        <SidebarSection key={group.title} title={group.title} items={group.items} />
      ))}
    </nav>
  );
}
