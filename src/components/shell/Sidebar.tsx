import Link from "next/link";
import type { NavigationItemProps } from "./NavigationItem";
import SidebarSection from "./SidebarSection";
export type SidebarSubgroup = { label: string; items: NavigationItemProps[] };
export type SidebarGroup = { title: string; items: (NavigationItemProps | SidebarSubgroup)[]; collapsible?: boolean };

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
  compact?: boolean;
}) {
  return (
    <nav className={`no-print sticky top-0 flex h-dvh shrink-0 flex-col gap-4 overflow-y-auto border-r border-border-nav bg-[#07172f] px-3 pb-5 ${props.compact ? "roadmap-sidebar w-[196px]" : "w-[238px]"}`}>
      <Link href={props.titleHref ?? "/home"} className="-mx-3 flex h-16 shrink-0 flex-col justify-center border-b border-white/10 px-5">
        {props.compact ? <span className="roadmap-brand"><span className="roadmap-brand-mark" aria-hidden><i /><i /></span><strong>CLARIVIA</strong></span> : <>
          <span className="text-[22px] font-bold leading-6 tracking-tight text-white">{props.title ?? "Clarivia"}</span>
          {!props.title && <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#a9b8d6]">Product owner</span>}
        </>}
      </Link>
      {props.groups.map((group) => (
        <SidebarSection key={group.title} title={group.title} items={group.items} collapsible={group.collapsible} />
      ))}
      {props.footer && <div className="mt-auto">{props.footer}</div>}
    </nav>
  );
}
