import Link from "next/link";
import Avatar from "@/components/ui/Avatar";
import ChevronIcon from "@/components/ui/ChevronIcon";

export default function TopHeader(props: {
  createActions: React.ReactNode;
  accountActions: React.ReactNode;
  userName: string;
  onOpenMenu: () => void;
  roadmap?: boolean;
  requestHref?: string;
  featureHref?: string;
  project?: { id: string; name: string };
  projects?: { id: string; name: string }[];
}) {
  return (
    <header className="no-print sticky top-0 z-30 flex h-16 min-w-0 items-center gap-2 border-b border-[#dfe3ee] bg-white px-4 text-[#111a32] sm:gap-5 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:flex-none">
        <button
          type="button"
          onClick={props.onOpenMenu}
          aria-label="Open navigation"
          className={`rounded-md p-2 text-[#283653] hover:bg-[#f4f5ff] ${props.roadmap ? "min-[851px]:hidden" : "xl:hidden"}`}
        >
          <span className="block h-0.5 w-5 bg-current" /><span className="mt-1 block h-0.5 w-5 bg-current" /><span className="mt-1 block h-0.5 w-5 bg-current" />
        </button>
        <details className="group relative min-w-0 flex-1 sm:w-[235px] sm:flex-none">
          <summary className="flex h-9 min-w-0 cursor-pointer list-none items-center justify-between gap-4 rounded-md border border-[#d9deeb] bg-white px-3 text-sm font-medium shadow-[0_1px_2px_rgba(15,25,50,0.04)] hover:border-[#a9a9fa] sm:px-4">
            <span className="truncate">{props.project?.name ?? "Projects"}</span>
            <ChevronIcon direction="down" size={13} className="shrink-0 text-[#485673]" />
          </summary>
          <div className="absolute left-0 z-50 mt-2 w-max min-w-full max-w-[min(320px,90vw)] rounded-lg border border-[#d9deeb] bg-white p-1.5 shadow-xl">
            <Link href="/projects" className="block rounded-md px-3 py-2 text-sm hover:bg-[#f4f4ff]">All projects</Link>
            {props.projects?.map(project => <Link key={project.id} href={`/projects/${project.id}`} className="block truncate rounded-md px-3 py-2 text-sm hover:bg-[#f4f4ff]">{project.name}</Link>)}
          </div>
        </details>
      </div>

      <details className="home-header-search group relative mx-auto hidden w-full max-w-[600px] flex-1 lg:block">
        <summary className="flex h-9 cursor-pointer list-none items-center gap-3 rounded-md border border-[#d9deeb] bg-[#fafbfe] px-4 text-sm text-[#667089] shadow-[0_1px_2px_rgba(15,25,50,0.04)] hover:border-[#a9a9fa]">
          <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
          <span className="truncate">Find requests or features...</span>
        </summary>
        <div className="absolute left-0 right-0 z-50 mt-2 rounded-lg border border-[#d9deeb] bg-white p-2 shadow-xl">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#78839b]">Search in a workspace</p>
          {props.requestHref && <Link href={props.requestHref} className="block rounded-md px-3 py-2 text-sm hover:bg-[#f4f4ff]">Requests and priorities →</Link>}
          {props.featureHref && <Link href={props.featureHref} className="block rounded-md px-3 py-2 text-sm hover:bg-[#f4f4ff]">Features and backlog →</Link>}
          {!props.requestHref && !props.featureHref && <Link href="/initiatives" className="block rounded-md px-3 py-2 text-sm hover:bg-[#f4f4ff]">Open an initiative to search its work →</Link>}
        </div>
      </details>

      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        <div className="hidden sm:block">{props.createActions}</div>
        <Link href="/activity" aria-label="Activity" title="Activity" className="hidden h-9 w-9 place-items-center rounded-md text-[#273451] hover:bg-[#f4f5ff] sm:grid">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
        </Link>
        <div className="hidden sm:block">{props.accountActions}</div>
        <button type="button" onClick={props.onOpenMenu} aria-label="Open account menu" className="rounded-full sm:hidden"><Avatar name={props.userName} /></button>
      </div>
    </header>
  );
}
