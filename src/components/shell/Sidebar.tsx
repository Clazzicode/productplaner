import Link from "next/link";
import type { NavigationItemProps } from "./NavigationItem";
import SidebarSection from "./SidebarSection";
export type SidebarGroup = { title: string; items: NavigationItemProps[]; collapsible?: boolean };

/**
 * `title`/`titleHref`/`footer` default to the standard product shell's
 * "Clarivia" -> /home. AdminShell (Block 6) passes its own title and a
 * "Back to Workspace" footer instead of duplicating this whole nav column.
 */
export default function Sidebar(props: {
  groups: SidebarGroup[];
  title?: string;
  titleHref?: string;
  footer?: React.ReactNode;
}) {
  return (
    <nav className="no-print sticky top-0 flex h-dvh w-[242px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-border-nav bg-nav px-3 pb-5 shadow-[8px_0_32px_rgba(7,22,47,0.12)]">
      <Link href={props.titleHref ?? "/home"} className="-mx-3 flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5">
        <span className="relative grid h-8 w-8 place-items-center" aria-hidden="true"><span className="absolute left-1 top-0 h-5 w-5 rounded-sm bg-[#7b6bff]" /><span className="absolute bottom-0 right-0 h-5 w-5 rounded-sm bg-[#3f5de0] opacity-90" /><span className="absolute bottom-1 left-0 h-3 w-3 rounded-sm bg-white/90" /></span>
        <span className="text-lg font-bold uppercase tracking-[0.08em] text-text-inverse">
          {props.title ?? "Clarivia"}
        </span>
      </Link>
      {props.groups.map((group) => (
        <SidebarSection key={group.title} title={group.title} items={group.items} collapsible={group.collapsible} />
      ))}
      {props.footer && <div className="mt-auto">{props.footer}</div>}
    </nav>
  );
}
