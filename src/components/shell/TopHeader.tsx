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
}) {
  return (
    <header className="no-print sticky top-0 z-30 flex h-16 min-w-0 items-center justify-between gap-3 border-b border-[#1b3153] bg-[#07162f] px-4 text-white shadow-[0_4px_18px_rgba(7,22,47,0.12)] sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={props.onOpenMenu} aria-label="Open navigation" className="rounded-lg p-2 text-white/80 hover:bg-white/10 xl:hidden">
          <span className="block h-0.5 w-5 bg-current" /><span className="mt-1 block h-0.5 w-5 bg-current" /><span className="mt-1 block h-0.5 w-5 bg-current" />
        </button>
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
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <div className="hidden 2xl:block">{props.switcher}</div>
        <div className="hidden sm:block">{props.createActions}</div>
        <div className="hidden xl:block">{props.accountActions}</div>
        <button type="button" onClick={props.onOpenMenu} aria-label="Open account menu" className="rounded-full xl:hidden"><Avatar name={props.userName} /></button>
      </div>
    </header>
  );
}
