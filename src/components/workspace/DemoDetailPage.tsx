import Link from "next/link";
import { notFound } from "next/navigation";
import { requireInitiativeView } from "@/lib/access/guards";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { demoInclude } from "@/lib/demos/service";

export type DemoDetailView = "information" | "google-meet" | "zoom";

const statusLabels: Record<string, string> = {
  proposed: "Proposed", preparing: "Preparing", ready: "Ready", not_ready: "Not ready",
  demonstrated: "Demonstrated", skipped: "Skipped", carried_over: "Carried over",
};

function notionLink(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    if (typeof item !== "string") continue;
    try {
      const url = new URL(item);
      const host = url.hostname.toLowerCase();
      if (url.protocol === "https:" && (host === "notion.so" || host.endsWith(".notion.so") || host === "notion.site" || host.endsWith(".notion.site"))) return url.toString();
    } catch { /* An evidence link may be an older free-form value. */ }
  }
  return null;
}

function Field({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={`grid gap-2 border-b border-[#e8eaf3] py-3 last:border-b-0 sm:grid-cols-[155px_minmax(0,1fr)] ${wide ? "sm:col-span-2" : ""}`}>
    <dt className="text-xs font-semibold text-[#26345a]">{label}</dt>
    <dd className={`min-w-0 whitespace-pre-wrap text-sm ${value.startsWith("Not ") || value === "No notes recorded" ? "text-[#74809a]" : "text-[#111a32]"}`}>{value}</dd>
  </div>;
}

function ProviderPage({ provider, demoTitle, agendaHref }: { provider: "Google Meet" | "Zoom"; demoTitle: string; agendaHref: string }) {
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
    <section className="rounded-2xl border border-[#dfe3f2] bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e8eaf3] pb-5">
        <div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#5145ed]">Meeting provider</p><h3 className="mt-1 text-xl font-bold text-[#101a35]">{provider} connection</h3></div>
        <span className="rounded-full bg-[#f0f1f6] px-3 py-1 text-xs font-semibold text-[#56627e]">Not connected</span>
      </div>
      <div className="mt-5 rounded-xl border border-[#d9d5ff] bg-[#f8f7ff] p-4 text-sm text-[#3b3b72]">
        Provider connections are part of the next integration phase. No meeting, link, or invitation has been created for this demo.
      </div>
      <dl className="mt-5"><Field label="Meeting title" value={`${demoTitle} demo`} /><Field label="Date & time" value="Not scheduled" /><Field label={provider === "Zoom" ? "Join link" : "Meeting link"} value="Not created" />{provider === "Zoom" && <Field label="Passcode" value="Not created" />}</dl>
      <button type="button" disabled className="mt-5 rounded-lg bg-[#e9e7f5] px-4 py-2 text-sm font-semibold text-[#77739b]" title="Requires a live provider connection">Connect {provider}</button>
    </section>
    <div className="space-y-4">
      <section className="rounded-2xl border border-[#dfe3f2] bg-white p-5 shadow-sm"><h3 className="font-bold text-[#101a35]">Guests</h3><p className="mt-3 text-sm text-[#68748c]">No provider guests or invitations recorded.</p><button type="button" disabled className="mt-4 rounded-lg border border-[#d9d5e9] px-3 py-2 text-xs font-semibold text-[#8a88a0]">Add guests · Connect {provider} first</button></section>
      <section className="rounded-2xl border border-[#dfe3f2] bg-white p-5 shadow-sm"><h3 className="font-bold text-[#101a35]">Invitation status</h3><p className="mt-3 text-sm text-[#68748c]">No invitations sent.</p></section>
      <section className="rounded-2xl border border-[#dfe3f2] bg-white p-5 shadow-sm"><h3 className="font-bold text-[#101a35]">Meeting activity</h3><p className="mt-3 text-sm text-[#68748c]">Activity will appear after a real {provider} connection is available.</p><Link href={agendaHref} className="mt-4 inline-block text-xs font-semibold text-[#5145ed] hover:underline">View demo agenda →</Link></section>
    </div>
  </div>;
}

export default async function DemoDetailPage({ initiativeId, demoId, view }: { initiativeId: string; demoId: string; view: DemoDetailView }) {
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  const access = await requireInitiativeView(user, initiativeId);
  const demo = await db.demoItem.findFirst({ where: { id: demoId, initiativeId }, include: demoInclude });
  if (!demo) notFound();
  const assignmentTargets = [
    ...(demo.storyId ? [{ storyId: demo.storyId }] : []),
    ...(demo.capabilityId ? [{ capabilityId: demo.capabilityId }] : []),
  ];
  const assignments = assignmentTargets.length ? await db.stakeholderAssignment.findMany({
    where: { organizationId: demo.organizationId, archivedAt: null, productRole: { in: ["engineer", "demo_owner"] }, OR: assignmentTargets },
    include: { stakeholder: { select: { displayName: true } } },
  }) : [];
  const namesFor = (role: string) => {
    const relevant = assignments.filter(row => row.productRole === role);
    const storyAssignments = relevant.filter(row => demo.storyId && row.storyId === demo.storyId);
    const names = [...new Set((storyAssignments.length ? storyAssignments : relevant).map(row => row.stakeholder.displayName))];
    return names.length ? names.join(", ") : "Not assigned";
  };
  const root = `/initiatives/${initiativeId}/workspace/demos`;
  const detail = `${root}/${demoId}`;
  const tabs: { view: DemoDetailView; label: string; href: string }[] = [
    { view: "information", label: "Demo information", href: detail },
    { view: "google-meet", label: "Google Meet", href: `${detail}/google-meet` },
    { view: "zoom", label: "Zoom", href: `${detail}/zoom` },
  ];
  const linkedNotion = notionLink(demo.evidenceLinks);
  const featureTitle = demo.capability?.name ?? "No linked feature";
  const bugData = demo.bug?.request.data;
  const bugTitle = bugData && typeof bugData === "object" && !Array.isArray(bugData) && "title" in bugData && typeof bugData.title === "string" ? bugData.title : "Linked bug";
  const workTitle = demo.story?.title ?? (demo.bug ? bugTitle : "No linked story");

  return <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
    <nav aria-label="Demo location" className="text-xs text-[#5b6680]"><Link href={root} className="font-semibold text-[#5145ed] hover:underline">Demos</Link><span className="mx-2">/</span><span>{demo.title}</span></nav>
    <div className="mt-3 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-bold tracking-tight text-[#101a35]">{view === "information" ? "Demo information" : view === "google-meet" ? "Google Meet" : "Zoom"}</h1><p className="mt-1 text-sm text-[#66718b]">{view === "information" ? "Review the committed work and the recorded demo details." : "Meeting details for this demo will live here when the provider integration is available."}</p></div><span className="rounded-full bg-[#eeeaff] px-3 py-1 text-xs font-semibold text-[#5145ed]">UI preview · provider integration pending</span></div>
    <nav aria-label="Demo detail pages" className="mt-6 flex gap-2 overflow-x-auto border-b border-[#dfe3f2]">{tabs.map(tab => <Link key={tab.view} href={tab.href} aria-current={view === tab.view ? "page" : undefined} className={`shrink-0 border-b-[3px] px-4 py-3 text-sm font-semibold ${view === tab.view ? "border-[#5145ed] text-[#5145ed]" : "border-transparent text-[#3b4560] hover:text-[#5145ed]"}`}>{tab.label}</Link>)}</nav>
    <div className="my-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dfe3f2] bg-white p-4 shadow-sm"><div><p className="text-sm font-bold text-[#101a35]">{demo.title}</p><p className="mt-0.5 text-xs text-[#67738e]">{workTitle} · {featureTitle} · Sprint {demo.sprint.sprintNumber}</p></div><Link href={root} className="rounded-lg border border-[#d9d5ef] px-3 py-2 text-xs font-semibold text-[#5145ed] hover:bg-[#f6f4ff]">View demo agenda ↗</Link></div>
    {view === "information" ? <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
      <section className="rounded-2xl border border-[#dfe3f2] bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold text-[#101a35]">Demo record</h2><span className="rounded-full bg-[#eeeaff] px-3 py-1 text-xs font-semibold text-[#5145ed]">{statusLabels[demo.status] ?? demo.status}</span></div><dl className="mt-4"><Field label="Story / feature title" value={`${workTitle} / ${featureTitle}`} /><Field label="Purpose" value={demo.purpose || "Not recorded"} /><Field label="Engineer" value={namesFor("engineer")} /><Field label="Demo owner" value={namesFor("demo_owner")} /><Field label="Presenter" value={demo.presenterNameSnapshot || "Not assigned"} /><Field label="Demo status" value={statusLabels[demo.status] ?? demo.status} /><Field label="Notes" value={demo.notes || "No notes recorded"} /><Field label="Sprint" value={`Sprint ${demo.sprint.sprintNumber}`} /><Field label="Completed work" value={demo.completedWork || "Not recorded"} /></dl><p className="mt-4 text-xs text-[#67738e]">{access.level === "view" ? "You have read-only access to this demo." : "Edit preparation, readiness, and outcomes from the existing demo agenda."}</p></section>
      <section className="h-fit rounded-2xl border border-[#dfe3f2] bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#5145ed]">Notes</p><h2 className="mt-1 text-lg font-bold text-[#101a35]">Notion notes</h2></div><span className="rounded-full bg-[#f0f1f6] px-2 py-1 text-xs font-semibold text-[#56627e]">Not connected</span></div><p className="mt-3 text-sm text-[#67738e]">The Notion app connection and synchronization will be added in the integration phase. Internal demo notes remain available in the record.</p>{linkedNotion ? <div className="mt-5 rounded-xl border border-[#dcd9f6] bg-[#faf9ff] p-4"><p className="text-xs font-semibold text-[#5145ed]">Existing evidence link · not synced</p><a href={linkedNotion} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-sm font-semibold text-[#101a35] underline">Open linked Notion page ↗</a></div> : <div className="mt-5 rounded-xl border border-dashed border-[#d8d4f4] p-5 text-center text-sm text-[#68748c]">No Notion page linked to this demo.</div>}<button type="button" disabled className="mt-5 w-full rounded-lg bg-[#e9e7f5] px-4 py-2.5 text-sm font-semibold text-[#77739b]" title="Available after Notion integration setup">Connect Notion · Coming later</button></section>
    </div> : <ProviderPage provider={view === "google-meet" ? "Google Meet" : "Zoom"} demoTitle={demo.title} agendaHref={root} />}
  </main>;
}
