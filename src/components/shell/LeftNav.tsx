"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import NavigationItem, { type NavigationItemProps } from "./NavigationItem";
import type { SidebarGroup, SidebarSubgroup } from "./Sidebar";
import { searchSections, sectionDestinations } from "./sectionSearch";
import PendingRequestsNavigation from "@/components/requests/PendingRequestsNavigation";

export interface NavInitiative {
  id: string;
  name: string;
  status: string;
  backlogId?: string | null;
  canEdit?: boolean;
  hasWorkspace?: boolean;
  project: { id: string; name: string } | null;
  syncConnections: { status: string }[];
}

/** One workflow for every account; only actual permissions filter destinations. */
const ICONS = ["target", "idea", "puzzle", "milestone", "connections", "feedback", "schedule", "people", "approval", "trend"] as const;
type IconName = typeof ICONS[number];
const DEFAULT_ICONS: Record<string, IconName> = {
  Features: "target", "Requests & Priorities": "idea", Backlog: "puzzle",
  Roadmap: "milestone", Integrations: "connections", Feedback: "feedback",
  Sprint: "schedule", "Teams & Stakeholders": "people", "PO Validation": "approval",
  Reports: "trend", Demos: "schedule", "Release Readiness": "approval",
  "Capacity & Cost": "trend", "Stories & Criteria": "puzzle",
};
const DEFAULT_PINS = ["Requests & Priorities", "Roadmap", "Demos", "Reports"];
type MenuPreferences = { pins: string[]; icons: Record<string, IconName> };

function SectionIcon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <Image src={`/sidebar-icons/${name}.svg`} alt="" width={size} height={size} unoptimized className="shrink-0" />;
}

function isSubgroup(item: NavigationItemProps | SidebarSubgroup): item is SidebarSubgroup { return "items" in item; }

export function buildSidebarGroups(props: { initiatives: NavInitiative[]; canManageWorkspace?: boolean; project?: { id: string; name: string } }, pathname: string): SidebarGroup[] {
  const match = pathname.match(/^\/initiatives\/([^/]+)/);
  const backlogId = pathname.match(/^\/backlogs\/([^/]+)/)?.[1];
  const current = (match && props.initiatives.find(row => row.id === match[1]))
    || (backlogId && props.initiatives.find(row => row.backlogId === backlogId)) || null;
  const scoped = (suffix: string, label: string): NavigationItemProps => current
    ? { label, href: `/initiatives/${current.id}/${suffix}` }
    : { label, href: null, disabled: { reason: props.project ? `Choose a feature in ${props.project.name} first.` : "Choose a product, then a feature first.", cta: { label: props.project ? "Choose feature" : "Choose product", href: props.project ? `/projects/${props.project.id}#product-features` : "/projects#product-list" } } };
  return [
    { title: "", items: [{ label: "Home", href: "/home" }, { label: "Products", href: "/projects" }, scoped("overview", "Five-tool guide")] },
    { title: "Plan", collapsible: true, items: [
      { label: "Features", items: [
        ...(props.project ? [{ label: "Features in this product", href: `/projects/${props.project.id}#product-features` }] : []),
        { label: "All products' features", href: "/initiatives", exact: true },
        ...(props.canManageWorkspace ? [{ label: "New feature", href: "/initiatives/new" }] : []),
        scoped("intake", "Feature brief"),
      ] },
      scoped("requests", "Requests & Priorities"), scoped("backlog", "Backlog"),
      scoped("workspace/epics", "Stories & Criteria"), scoped("workspace/refinement", "Refinement"),
      scoped("workspace/roadmap", "Roadmap"), scoped("workspace/documents", "Documents"),
      ...(current?.canEdit ? [scoped("workspace/regeneration", "Review regeneration")] : []),
      scoped("workspace/features", "Feature hierarchy"), { label: "Teams & Stakeholders", href: "/teams" },
      ...(props.canManageWorkspace ? [{ label: "Integrations", href: "/integrations" }] : []),
    ] },
    { title: "Deliver", collapsible: true, items: [
      { label: "Sprint", items: [scoped("workspace/sprint-preparation", "Sprint Planning"),
        scoped("workspace/sprints", "Sprints & Releases"), scoped("workspace/sprint-review", "Sprint Review")] },
      scoped("workspace/demos", "Demos"), scoped("workspace/validation", "PO Validation"),
      scoped("workspace/capacity", "Capacity & Cost"), scoped("workspace/release-readiness", "Release Readiness"),
    ] },
    { title: "Learn", collapsible: true, items: [
      scoped("workspace/feedback", "Feedback"), { label: "Risks & Blockers", href: "/risks" },
      { label: "Decisions", href: "/decisions" }, { label: "Activity", href: "/activity" },
      scoped("workspace/matrix", "Matrix Portal"), scoped("workspace/executive", "Reports"),
    ] },
  ];
}

export default function LeftNav(props: { initiatives: NavInitiative[]; canManageWorkspace?: boolean; userId?: string; project?: { id: string; name: string } }) {
  const pathname = usePathname() ?? "";
  const groups = buildSidebarGroups(props, pathname);
  const activeFeature = props.initiatives.some(initiative => pathname.startsWith(`/initiatives/${initiative.id}/`) || pathname === `/initiatives/${initiative.id}` || (initiative.backlogId && pathname === `/backlogs/${initiative.backlogId}`));
  const productFeatures = props.initiatives.filter(initiative => initiative.project?.id === props.project?.id);
  const nextStep = activeFeature ? null : props.project
    ? { kind: "feature" as const, href: `/projects/${props.project.id}`, label: "Choose a feature", detail: `In ${props.project.name}` }
    : { kind: "product" as const, href: "/projects#product-list", label: "Choose a product", detail: "Then select a feature" };
  const destinations = sectionDestinations(groups);
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [prefs, setPrefs] = useState<MenuPreferences>({ pins: DEFAULT_PINS, icons: {} });
  const [loaded, setLoaded] = useState(false);
  const storageKey = `clarivia-sidebar-v1:${props.userId ?? "user"}`;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Partial<MenuPreferences> | null;
        setPrefs({ pins: Array.isArray(saved?.pins) ? saved.pins.filter((pin): pin is string => typeof pin === "string") : DEFAULT_PINS, icons: saved?.icons && typeof saved.icons === "object" ? saved.icons : {} });
      } catch { setPrefs({ pins: DEFAULT_PINS, icons: {} }); }
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);
  useEffect(() => {
    if (!loaded) return;
    const serialized = JSON.stringify(prefs);
    if (localStorage.getItem(storageKey) !== serialized) {
      localStorage.setItem(storageKey, serialized);
      window.dispatchEvent(new Event("clarivia-sidebar-preferences"));
    }
  }, [loaded, prefs, storageKey]);
  useEffect(() => {
    const sync = () => {
      const saved = localStorage.getItem(storageKey);
      if (saved) setPrefs(previous => JSON.stringify(previous) === saved ? previous : JSON.parse(saved) as MenuPreferences);
    };
    window.addEventListener("storage", sync);
    window.addEventListener("clarivia-sidebar-preferences", sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener("clarivia-sidebar-preferences", sync); };
  }, [storageKey]);

  const iconFor = (label: string): IconName => ICONS.includes(prefs.icons[label]) ? prefs.icons[label] : DEFAULT_ICONS[label] ?? "target";
  const chooseIcon = (label: string, name: IconName) => setPrefs(previous => ({ ...previous, icons: { ...previous.icons, [label]: name } }));
  const togglePin = (label: string) => setPrefs(previous => ({ ...previous, pins: previous.pins.includes(label) ? previous.pins.filter(pin => pin !== label) : [...previous.pins, label] }));
  const destinationFor = (label: string) => destinations.find(item => item.label === label);
  const matches = searchSections(query, destinations);

  const iconPicker = (label: string) => <details className="relative" onClick={event => event.stopPropagation()}>
    <summary className="list-none rounded p-1 text-[#a9b8e5] hover:bg-white/10" aria-label={`Change icon for ${label}`} title="Change icon">✎</summary>
    <div className="absolute right-0 top-7 z-30 grid w-40 grid-cols-5 gap-1 rounded-lg border border-[#42577a] bg-[#102643] p-2 shadow-xl">
      {ICONS.map(name => <button key={name} type="button" title={name} aria-label={`Use ${name} icon for ${label}`} onClick={event => { chooseIcon(label, name); event.currentTarget.closest("details")?.removeAttribute("open"); }} className={`grid h-7 w-7 place-items-center rounded hover:bg-white/15 ${iconFor(label) === name ? "bg-[#5145ed]" : ""}`}><SectionIcon name={name} size={18} /></button>)}
    </div>
  </details>;

  const renderItem = (item: NavigationItemProps | SidebarSubgroup) => isSubgroup(item)
    ? <details key={item.label} className={`group relative rounded-lg border border-white/10 bg-white/[0.04] ${item.label === "Features" && nextStep?.kind === "feature" ? "next-step-glow" : ""}`} open={item.items.some(child => child.href === pathname) || undefined}>
        <summary className={`flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg px-3 text-[13px] text-[#e2e9f8] hover:bg-white/10 ${tab === "all" ? "pr-14" : ""}`}><span className="text-[#aebce0] group-open:rotate-90">›</span><SectionIcon name={iconFor(item.label)} size={17} /><span>{item.label}</span>{item.label === "Features" && nextStep?.kind === "feature" && <span aria-hidden="true" className="ml-auto text-lg text-[#c9baff]">➜</span>}</summary>
        {tab === "all" && <div className="absolute right-1 top-1 flex items-center gap-0.5">{iconPicker(item.label)}<button type="button" onClick={() => togglePin(item.label)} aria-label={`${prefs.pins.includes(item.label) ? "Unpin" : "Pin"} ${item.label}`} title={prefs.pins.includes(item.label) ? "Unpin" : "Pin"} className="p-1 text-[#a9b8e5] hover:text-white">{prefs.pins.includes(item.label) ? "◆" : "◇"}</button></div>}
        <div className="space-y-0.5 border-t border-white/10 py-1 pl-4 pr-1">{item.items.map(child => renderItem(child))}</div>
      </details>
    : <div key={item.label} className="group/row flex items-center gap-1 rounded-lg hover:bg-white/[0.06]">
        <div className="min-w-0 flex-1"><NavigationItem {...item} nextStep={item.label === "Products" && nextStep?.kind === "product"} icon={groups[0].items.includes(item) ? undefined : <SectionIcon name={iconFor(item.label)} size={19} />} /></div>
        {tab === "all" && <div className="flex shrink-0 items-center pr-1 opacity-0 focus-within:opacity-100 group-hover/row:opacity-100">
          {iconPicker(item.label)}<button type="button" onClick={() => togglePin(item.label)} aria-label={`${prefs.pins.includes(item.label) ? "Unpin" : "Pin"} ${item.label}`} title={prefs.pins.includes(item.label) ? "Unpin" : "Pin"} className="p-1 text-[#a9b8e5] hover:text-white">{prefs.pins.includes(item.label) ? "◆" : "◇"}</button>
        </div>}
      </div>;

  return <nav aria-label="Main navigation" className="no-print sticky top-0 flex h-dvh w-[253px] shrink-0 flex-col border-r border-[#243a58] bg-[#071a34] text-white">
    <Link href="/home" className="block shrink-0 px-[26px] pb-4 pt-2"><span className="block text-[24px] font-semibold leading-7 tracking-[-0.04em]">Clarivia</span><span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-[#b4c2e6]">Product platform</span></Link>
    <div className="mx-[19px] flex h-[38px] shrink-0 rounded-lg border border-[#405575] p-0.5 text-[13px]">
      <button type="button" onClick={() => setTab("mine")} aria-pressed={tab === "mine"} className={`flex flex-1 items-center justify-center gap-1 rounded-md ${tab === "mine" ? "bg-[#5145ed] font-semibold" : "text-[#dae4f7] hover:bg-white/10"}`}><span aria-hidden>♙</span>My menu</button>
      <button type="button" onClick={() => setTab("all")} aria-pressed={tab === "all"} className={`flex flex-1 items-center justify-center gap-1 rounded-md ${tab === "all" ? "bg-[#5145ed] font-semibold" : "text-[#dae4f7] hover:bg-white/10"}`}><span aria-hidden>▦</span>All sections</button>
    </div>
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-[19px] pb-4">
      <div className="space-y-0.5 border-b border-[#52627a] py-4">{groups[0].items.map(renderItem)}</div>
      {nextStep?.kind === "product" && <Link href={nextStep.href} className="next-step-glow mt-3 flex items-center gap-2 rounded-lg border border-[#796dff] bg-[#241e68] px-3 py-2 text-xs text-white hover:bg-[#30277e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><span aria-hidden="true" className="text-lg">➜</span><span className="min-w-0"><strong className="block">Next: {nextStep.label}</strong><span className="block truncate text-[#d3cfff]">{nextStep.detail}</span></span></Link>}
      {nextStep?.kind === "feature" && <details className="next-step-glow mt-3 rounded-lg border border-[#796dff] bg-[#241e68] text-xs text-white">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2"><span aria-hidden="true" className="text-lg">➜</span><span className="min-w-0"><strong className="block">Next: {nextStep.label}</strong><span className="block truncate text-[#d3cfff]">{nextStep.detail}</span></span></summary>
        <div className="no-scrollbar max-h-48 space-y-1 overflow-y-auto border-t border-[#796dff] p-2">
          {productFeatures.map(feature => <Link key={feature.id} href={`/initiatives/${feature.id}/overview`} className="block rounded px-2 py-1.5 hover:bg-white/15">{feature.name}</Link>)}
          {productFeatures.length === 0 && <p className="px-2 py-1.5 text-[#d3cfff]">No features available to you in this product yet.</p>}
          {productFeatures.length === 0 && props.canManageWorkspace && props.project && <Link href={`/projects/${props.project.id}/initiatives/new`} className="block rounded px-2 py-1.5 font-semibold hover:bg-white/15">Create a feature</Link>}
          {productFeatures.length === 0 && !props.canManageWorkspace && <p className="px-2 py-1.5 text-[#d3cfff]">Ask a workspace admin to add or share one.</p>}
          <Link href={`${nextStep.href}#product-features`} className="block rounded px-2 py-1.5 text-[#d3cfff] hover:bg-white/15">View product overview</Link>
        </div>
      </details>}
      {tab === "mine" && <section className="pt-4" aria-label="Pinned shortcuts">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-[13px] font-semibold">Pinned shortcuts</h2><button type="button" onClick={() => setEditing(!editing)} className="text-[12px] text-[#a68cff] hover:text-white">✎ {editing ? "Done" : "Edit pins"}</button></div>
        <div className="grid grid-cols-2 gap-2">{prefs.pins.filter(pin => destinationFor(pin)).map(pin => { const destination = destinationFor(pin)!; return <div key={pin} className={`relative min-h-[73px] rounded-[10px] border bg-gradient-to-br from-[#162d4d] to-[#102540] ${pathname === destination.href ? "border-[#6657ff] ring-1 ring-[#6657ff]" : "border-[#334864]"}`}>
          <Link href={destination.href} prefetch={destination.href.endsWith("/requests") ? false : undefined} className="flex h-full flex-col justify-end gap-1 px-3 py-2 pr-5 text-[13px] leading-tight hover:bg-white/[0.05]"><SectionIcon name={iconFor(pin)} size={23} /><span className="truncate">{pin === "Requests & Priorities" ? "Requests" : pin}</span>{destination.href.endsWith("/requests") && <PendingRequestsNavigation />}</Link>
          <button type="button" onClick={() => togglePin(pin)} aria-label={`Unpin ${pin}`} title="Unpin" className="absolute right-1.5 top-1.5 text-[#a58bff]">{editing ? <span className="text-base leading-none">×</span> : <svg aria-hidden width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="m6 1 5 1-1 3 2 2-.5 1.5-3-.5-2 5-1.5 1 .5-6L3 7l.5-1.5L6 5V1Z"/></svg>}</button>
          {editing && <div className="absolute bottom-1 right-1">{iconPicker(pin)}</div>}
        </div>; })}</div>
        {editing && <p className="mt-2 text-[11px] text-[#b6c6e1]">Open All sections to pin more destinations or change their icons.</p>}
      </section>}
      <div className="relative mt-6"><span aria-hidden className="absolute left-3 top-2.5 text-[#bfd0ee]">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a section..." aria-label="Find a section" className="h-[37px] w-full rounded-lg border border-[#627694] bg-[#1b304d] pl-8 pr-2 text-[13px] text-white placeholder:text-[#bbcae2] focus:border-[#a68cff] focus:outline-none" /></div>
      {query.trim() ? <div className="mt-3 space-y-1" aria-live="polite">{matches.slice(0, 12).map(match => <Link key={`${match.label}-${match.href}`} href={match.href} prefetch={match.href.endsWith("/requests") ? false : undefined} className="flex items-center gap-2 rounded-lg px-2 py-2 text-[13px] hover:bg-white/10"><SectionIcon name={iconFor(match.label)} size={17} /><span className="min-w-0 flex-1 truncate">{match.label}</span><span className="text-[10px] text-[#96a9cb]">{match.group}</span>{match.href.endsWith("/requests") && <PendingRequestsNavigation />}</Link>)}{matches.length === 0 && <p className="px-2 py-2 text-xs text-[#b6c6e1]">No matching section</p>}</div>
      : <section className="mt-5" aria-label="Browse sections"><h2 className="mb-2 text-[12px] font-semibold">Browse sections</h2><div className="space-y-1.5">{groups.slice(1).map(group => <details key={group.title} className="rounded-lg border border-[#344b6b] bg-white/[0.05]"><summary className="flex h-[35px] cursor-pointer list-none items-center gap-3 px-3 text-[13px] font-medium uppercase"><SectionIcon name={group.title === "Plan" ? "puzzle" : group.title === "Deliver" ? "schedule" : "trend"} size={17} /><span className="flex-1">{group.title}</span><span className="text-[#b9c9ee]">⌄</span></summary><div className="space-y-1 border-t border-white/10 p-1">{group.items.map(renderItem)}</div></details>)}</div></section>}
    </div>
    <div className="shrink-0 border-t border-[#334864] px-[19px] py-2"><NavigationItem label="Account settings" href="/account/settings" /></div>
  </nav>;
}
