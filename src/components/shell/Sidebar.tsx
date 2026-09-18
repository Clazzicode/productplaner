import Link from "next/link";
import type { NavigationItemProps } from "./NavigationItem";
import SidebarSection from "./SidebarSection";

/**
 * `title`/`titleHref`/`footer` default to the standard product shell's
 * "Guided Planning" -> /home. AdminShell (Block 6) passes its own title and a
 * "Back to Workspace" footer instead of duplicating this whole nav column.
 */
export default function Sidebar(props: {
  groups: { title: string; items: NavigationItemProps[] }[];
  title?: string;
  titleHref?: string;
  footer?: React.ReactNode;
}) {
  return (
    <nav className="no-print sticky top-0 flex h-screen w-[242px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-border-nav bg-nav px-3 py-5 shadow-[8px_0_32px_rgba(7,22,47,0.12)]">
      <Link href={props.titleHref ?? "/home"} className="flex items-center gap-3 px-2 py-1">
        <span className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#796dff,#356cff)] shadow-[0_0_24px_rgba(91,91,255,.45)]">
          <span className="ml-0.5 h-0 w-0 border-y-[6px] border-l-[9px] border-y-transparent border-l-white" />
        </span>
        <span className="text-sm font-bold uppercase tracking-[0.08em] text-text-inverse">
          {props.title ?? "Guided Planning"}
        </span>
      </Link>
      {props.groups.map((group) => (
        <SidebarSection key={group.title} title={group.title} items={group.items} />
      ))}
      {props.footer && <div className="mt-auto">{props.footer}</div>}
    </nav>
  );
}
