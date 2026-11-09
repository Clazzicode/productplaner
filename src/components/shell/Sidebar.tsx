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
  homeMode?: boolean;
  compact?: boolean;
}) {
  return (
    <nav className={`no-print sticky top-0 flex h-dvh shrink-0 flex-col gap-4 overflow-y-auto border-r border-border-nav bg-[#07172f] px-3 pb-5 ${props.compact ? "roadmap-sidebar w-[196px]" : "w-[238px]"}`}>
      <Link href={props.titleHref ?? "/home"} className="-mx-3 flex h-16 shrink-0 flex-col justify-center border-b border-white/10 px-5">
        <span className="text-[22px] font-bold leading-6 tracking-tight text-white">{props.title ?? "Clarivia"}</span>
        {!props.title && <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#a9b8d6]">Product owner</span>}
      </Link>
      {props.homeMode ? (
        <>
          <SidebarSection title="" items={props.groups[0]?.items ?? []} />
          <details className="mt-auto rounded-md border border-white/10 px-2 py-2 text-[#b9c9ee]">
            <summary className="cursor-pointer text-sm font-semibold">All tools</summary>
            <div className="mt-3 space-y-3">{props.groups.slice(1).map(group => <SidebarSection key={group.title} title={group.title} items={group.items} collapsible={group.collapsible} />)}</div>
          </details>
        </>
      ) : props.groups.map((group) => (
        <SidebarSection key={group.title} title={group.title} items={group.items} collapsible={group.collapsible} />
      ))}
      {props.footer && <div className="mt-auto">{props.footer}</div>}
    </nav>
  );
}
