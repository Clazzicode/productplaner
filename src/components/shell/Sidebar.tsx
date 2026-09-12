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
    <nav className="no-print sticky top-0 flex h-screen w-56 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border-nav bg-nav px-3 py-5">
      <Link href={props.titleHref ?? "/home"} className="px-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-text-inverse">
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
