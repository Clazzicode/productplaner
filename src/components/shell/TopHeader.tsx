import Link from "next/link";
import Avatar from "@/components/ui/Avatar";

type Crumb = { label: string; href?: string };

export default function TopHeader(props: {
  breadcrumbs: Crumb[];
  switcher: React.ReactNode;
  createActions: React.ReactNode;
  accountActions: React.ReactNode;
  currentName: string;
  userName: string;
  onOpenMenu: () => void;
  home?: boolean;
  requestHref?: string;
  featureHref?: string;
  project?: { id: string; name: string };
  projects?: { id: string; name: string }[];
}) {
  const home = Boolean(props.home);
  return (
    <header className={`no-print sticky top-0 z-30 flex h-16 min-w-0 items-center gap-2 border-b px-4 sm:gap-5 sm:px-6 ${home ? "border-[#dfe3ee] bg-white text-[#111a32]" : "justify-between border-[#1b3153] bg-[#07162f] text-white shadow-[0_4px_18px_rgba(7,22,47,0.12)]"}`}>
      <div className={`flex min-w-0 items-center gap-3 ${home ? "flex-1 sm:flex-none" : ""}`}>
        <button type="button" onClick={props.onOpenMenu} aria-label="Open navigation" className={`rounded-md p-2 xl:hidden ${home ? "text-[#283653] hover:bg-[#f4f5ff]" : "text-white/80 hover:bg-white/10"}`}>
          <span className="block h-0.5 w-5 bg-current" /><span className="mt-1 block h-0.5 w-5 bg-current" /><span className="mt-1 block h-0.5 w-5 bg-current" />
        </button>
        {home ? (
          <details className="group relative min-w-0 flex-1 sm:w-[235px] sm:flex-none">
            <summary className="flex h-10 min-w-0 cursor-pointer list-none items-center justify-between gap-4 rounded-md border border-[#d9deeb] bg-white px-3 text-base font-semibold shadow-[0_1px_2px_rgba(15,25,50,0.04)] hover:border-[#a9a9fa] sm:px-4">
              <span className="truncate">{props.project?.name ?? "Projects"}</span><span aria-hidden className="text-[#485673]">⌄</span>
            </summary>
            <div className="absolute left-0 z-50 mt-2 w-max min-w-full max-w-[min(320px,90vw)] rounded-lg border border-[#d9deeb] bg-white p-1.5 shadow-xl">
              <Link href="/projects" className="block rounded-md px-3 py-2 text-sm hover:bg-[#f4f4ff]">All projects</Link>
              {props.projects?.map(project => <Link key={project.id} href={`/projects/${project.id}`} className="block truncate rounded-md px-3 py-2 text-sm hover:bg-[#f4f4ff]">{project.name}</Link>)}
            </div>
          </details>
        ) : (
          <>
            <Link href="/home" className="flex shrink-0 items-center gap-2 font-bold tracking-[0.08em] text-white xl:hidden">
              <span className="relative h-7 w-7" aria-hidden="true"><span className="absolute left-1 top-0 h-4 w-4 rounded-sm bg-[#7b6bff]" /><span className="absolute bottom-0 right-0 h-4 w-4 rounded-sm bg-[#3f5de0]" /><span className="absolute bottom-1 left-0 h-2.5 w-2.5 rounded-sm bg-white/90" /></span>
              <span className="hidden sm:inline">CLARIVIA</span>
            </Link>
            <nav aria-label="Location" className="hidden min-w-0 items-center gap-2 text-sm md:flex">
              {props.breadcrumbs.map((crumb, index) => (
                <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-2">
                  {index > 0 && <span aria-hidden className="text-white/35">›</span>}
                  {crumb.href ? <Link href={crumb.href} className="max-w-48 truncate text-white/70 hover:text-white" title={crumb.label}>{crumb.label}</Link>
                    : <span className="max-w-48 truncate font-semibold text-white" aria-current="page" title={crumb.label}>{crumb.label}</span>}
                </span>
              ))}
            </nav>
            <span className="min-w-0 truncate text-sm font-semibold md:hidden">{props.currentName}</span>
          </>
        )}
      </div>
      {home && (
        <details className="home-header-search group relative mx-auto hidden w-full max-w-[600px] lg:block">
          <summary className="flex h-10 cursor-pointer list-none items-center gap-3 rounded-md border border-[#d9deeb] bg-[#fafbfe] px-4 text-base text-[#667089] shadow-[0_1px_2px_rgba(15,25,50,0.04)] hover:border-[#a9a9fa]">
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
      )}
      <div className={`flex shrink-0 items-center gap-2 sm:gap-3 ${home ? "ml-auto" : ""}`}>
        {!home && <div className="hidden 2xl:block">{props.switcher}</div>}
        <div className="hidden sm:block">{props.createActions}</div>
        {home && <Link href="/activity" aria-label="Activity" title="Activity" className="hidden h-9 w-9 place-items-center rounded-md text-[#273451] hover:bg-[#f4f5ff] sm:grid"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg></Link>}
        <div className={home ? "hidden sm:block" : "hidden xl:block"}>{props.accountActions}</div>
        <button type="button" onClick={props.onOpenMenu} aria-label="Open account menu" className={`rounded-full ${home ? "sm:hidden" : "xl:hidden"}`}><Avatar name={props.userName} /></button>
      </div>
    </header>
  );
}
