"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Avatar from "@/components/ui/Avatar";
import ChevronIcon from "@/components/ui/ChevronIcon";
import DismissibleDetails from "./DismissibleDetails";
import { searchSections, type SectionDestination } from "./sectionSearch";

export default function TopHeader(props: {
  createActions: React.ReactNode;
  accountActions: React.ReactNode;
  userName: string;
  onOpenMenu: () => void;
  roadmap?: boolean;
  requestHref?: string;
  featureHref?: string;
  project?: { id: string; name: string };
  feature?: { id: string; name: string };
  projects?: { id: string; name: string }[];
  destinations: SectionDestination[];
}) {
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [switchTarget, setSwitchTarget] = useState("");
  const router = useRouter();
  const results = searchSections(search, props.destinations).slice(0, 8);
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
        <DismissibleDetails className="group relative min-w-0 flex-1 sm:w-[300px] sm:flex-none">
          <summary aria-label="Current product and feature; switch product" className="flex min-h-11 min-w-0 cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-[#d9deeb] bg-white px-3 py-1 text-xs shadow-[0_1px_2px_rgba(15,25,50,0.04)] hover:border-[#a9a9fa]">
            <span className="min-w-0 leading-4"><span className="block truncate font-semibold">Product: {props.project?.name ?? "All products"}</span><span className="block truncate text-[#667089]">Feature: {props.feature?.name ?? "None selected"}</span></span>
            <ChevronIcon direction="down" size={13} className="shrink-0 text-[#485673]" />
          </summary>
          <div className="absolute left-0 z-50 mt-2 w-[min(340px,90vw)] rounded-lg border border-[#d9deeb] bg-white p-4 shadow-xl">
            <p className="text-sm font-semibold">Switch product</p>
            <p className="mt-1 text-xs text-[#667089]">Choose a destination, then confirm. You will land on its overview.</p>
            <label htmlFor="product-switch-target" className="mt-3 block text-xs font-medium">Destination product</label>
            <select id="product-switch-target" value={switchTarget} onChange={event => setSwitchTarget(event.target.value)} className="mt-1 w-full rounded-md border border-[#d9deeb] bg-white px-2 py-2 text-sm">
              <option value="">Choose a product…</option>
              {props.projects?.filter(project => project.id !== props.project?.id).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            {props.projects?.find(project => project.id === switchTarget && project.id !== props.project?.id) && <Link href={`/projects/${switchTarget}`} className="mt-3 block rounded-md bg-[#5145ed] px-3 py-2 text-center text-sm font-semibold text-white hover:bg-[#4238d7]">Switch to {props.projects?.find(project => project.id === switchTarget)?.name}</Link>}
            {props.project && <Link href="/projects" className="mt-3 block text-sm text-[#5145ed] hover:underline">View all products</Link>}
          </div>
        </DismissibleDetails>
      </div>

      <div className="home-header-search relative mx-auto hidden w-full max-w-[600px] flex-1 md:block" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchFocused(false); }}>
        <div className="flex h-9 items-center gap-3 rounded-md border border-[#d9deeb] bg-[#fafbfe] px-4 text-sm text-[#667089] shadow-[0_1px_2px_rgba(15,25,50,0.04)] focus-within:border-[#8880f5]">
          <svg aria-hidden="true" className="shrink-0" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} onFocus={() => setSearchFocused(true)} onKeyDown={event => { if (event.key === "Escape") { setSearch(""); setSearchFocused(false); event.currentTarget.blur(); } if (event.key === "Enter" && results[0]) { router.push(results[0].href); setSearch(""); setSearchFocused(false); event.currentTarget.blur(); } }} aria-label="Search sections" aria-controls="header-section-results" aria-expanded={searchFocused && search.trim().length > 0} role="combobox" placeholder="Find requests or features..." className="w-full min-w-0 bg-transparent outline-none placeholder:text-[#667089]" />
        </div>
        {searchFocused && search.trim() && <div id="header-section-results" role="listbox" className="absolute left-0 right-0 z-50 mt-2 max-h-80 overflow-y-auto rounded-lg border border-[#d9deeb] bg-white p-2 shadow-xl">
          {results.length ? results.map(result => <Link role="option" aria-selected={false} key={`${result.label}-${result.href}`} href={result.href} onClick={() => { setSearch(""); setSearchFocused(false); }} className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm hover:bg-[#f4f4ff] focus:bg-[#f4f4ff]"><span>{result.label}</span><span className="text-xs text-[#78839b]">{result.group}</span></Link>) : <p className="px-3 py-2 text-sm text-[#78839b]">No matching section</p>}
        </div>}
      </div>

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
