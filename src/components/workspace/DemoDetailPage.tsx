import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { requireInitiativeView } from "@/lib/access/guards";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { demoInclude } from "@/lib/demos/service";
import { notionEvidenceLink } from "@/lib/demos/notionLink";

export type DemoDetailView = "information" | "google-meet" | "zoom";

const statusLabels: Record<string, string> = {
  proposed: "Proposed", preparing: "Preparing", ready: "Ready", not_ready: "Not ready",
  demonstrated: "Demonstrated", skipped: "Skipped", carried_over: "Carried over",
};

function Field({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return <div className="grid min-w-0 gap-2 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-start sm:gap-4">
    <dt className="pt-1.5 text-xs font-semibold text-[#182544]">{label}</dt>
    <dd className={`min-w-0 rounded-lg border border-[#d8def0] bg-[#fbfcff] px-3 py-1.5 text-[13px] leading-5 ${multiline ? "min-h-12 whitespace-pre-wrap" : ""} ${value.startsWith("Not ") || value === "No notes recorded" ? "text-[#74809a]" : "text-[#263252]"}`}>{value}</dd>
  </div>;
}

function ProviderPage({ provider, demoTitle, agendaHref }: { provider: "Google Meet" | "Zoom"; demoTitle: string; agendaHref: string }) {
  return <section className="overflow-hidden rounded-xl border border-[#d9dff0] bg-white shadow-[0_3px_16px_rgba(40,39,109,.04)]">
    <div className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e8eaf3] pb-3">
        <div className="flex items-center gap-3"><span className={`flex h-9 shrink-0 items-center justify-center rounded-lg border border-[#e2e5f1] bg-white ${provider === "Zoom" ? "w-[72px]" : "w-11"}`}><Image src={provider === "Zoom" ? "/brands/zoom-logo.png" : "/brands/google-meet.svg"} alt="" width={provider === "Zoom" ? 56 : 27} height={provider === "Zoom" ? 13 : 22} /></span><div><h2 className="text-base font-bold text-[#101a35]">{provider} connection</h2><p className="mt-1 text-xs text-[#74809c]">Meeting account not connected</p></div></div>
        <span className="rounded-full bg-[#f0f1f6] px-3 py-1 text-xs font-semibold text-[#56627e]">Not connected</span>
      </div>
      <div className="mt-3 rounded-lg border border-[#d9d5ff] bg-[#f8f7ff] px-3 py-2 text-xs leading-5 text-[#3b3b72]">
        {provider} integration is coming later. No meeting, link, guest invitation, or activity has been created for this demo.
      </div>
      <h3 className="mt-3 text-sm font-bold text-[#101a35]">Meeting details</h3><dl className="mt-2 space-y-1.5"><Field label="Suggested title" value={`${demoTitle} demo`} /><Field label="Date & time" value="Not scheduled" /><Field label={provider === "Zoom" ? "Join link" : "Meeting link"} value="Not created" />{provider === "Zoom" && <Field label="Passcode" value="Not created" />}</dl>
      <div className="mt-3 border-t border-[#e5e8f3] pt-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-[#101a35]">Guests</h3><button type="button" disabled className="rounded-lg border border-[#dddaf4] bg-[#f8f7ff] px-3 py-1 text-xs font-semibold text-[#8986a5]">Add guests</button></div><p className="mt-2 rounded-lg border border-dashed border-[#d9dff0] bg-[#fafaff] px-3 py-3 text-center text-xs text-[#74809c]">Connect {provider} to manage meeting guests.</p></div>
      <div className="mt-3 border-t border-[#e5e8f3] pt-3"><h3 className="text-sm font-bold text-[#101a35]">Invitation status</h3><p className="mt-2 rounded-lg border border-[#e2e6f3] bg-[#fafaff] px-3 py-2 text-xs text-[#68748c]">No invitations sent. Invitation history will appear after integration.</p></div>
      <div className="mt-3 border-t border-[#e5e8f3] pt-3"><h3 className="text-sm font-bold text-[#101a35]">Meeting activity</h3><p className="mt-2 text-xs text-[#68748c]">No provider activity has been recorded.</p><Link href={agendaHref} className="mt-3 inline-block text-xs font-semibold text-[#5145ed] hover:underline">View demo agenda →</Link></div>
    </div>
  </section>;
}

type DisplayDemo = { title: string; purpose: string; status: string; notes: string; completedWork: string; presenterNameSnapshot: string; sprint: { sprintNumber: number }; capability: { name: string } | null };

export function DemoDetailContent({ view, demo, root, detail, workTitle, engineer, demoOwner, linkedNotion, readOnly }: { view: DemoDetailView; demo: DisplayDemo; root: string; detail: string; workTitle: string; engineer: string; demoOwner: string; linkedNotion: string | null; readOnly: boolean }) {
  const preview = detail.includes("?view=demo-info");
  const tabs: { view: DemoDetailView; label: string; href: string }[] = [
    { view: "information", label: "Demo information", href: detail },
    { view: "google-meet", label: "Google Meet", href: preview ? "/workflow-preview?view=demo-meet" : `${detail}/google-meet` },
    { view: "zoom", label: "Zoom", href: preview ? "/workflow-preview?view=demo-zoom" : `${detail}/zoom` },
  ];
  const featureTitle = demo.capability?.name ?? "No linked feature";
  return <main className="min-h-full bg-[#f7f7ff] px-4 pb-10 pt-4 sm:px-6 lg:px-8"><div className="mx-auto max-w-[1040px]">
    <nav aria-label="Demo location" className="text-xs text-[#5b6680]"><Link href={root} className="font-semibold text-[#5145ed] hover:underline">Demos</Link><span className="mx-2">/</span><span>Demo management</span></nav>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><h1 className="text-[28px] font-bold leading-tight tracking-[-.035em] text-[#101a35]">{view === "information" ? "Demo information" : view === "google-meet" ? "Google Meet" : "Zoom"}</h1><span className="rounded-full bg-[#eeeaff] px-3 py-1 text-[11px] font-semibold text-[#5145ed]">{view === "information" ? "Demo record" : "Integration coming soon"}</span></div>
    <nav aria-label="Demo detail pages" className="mt-2 flex gap-1 overflow-x-auto border-b border-[#dfe3f2]">{tabs.map(tab => <Link key={tab.view} href={tab.href} aria-current={view === tab.view ? "page" : undefined} className={`shrink-0 border-b-[3px] px-4 py-3 text-xs font-semibold ${view === tab.view ? "border-[#5145ed] text-[#5145ed]" : "border-transparent text-[#3b4560] hover:text-[#5145ed]"}`}>{tab.label}</Link>)}</nav>
    <div className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dfe3f2] bg-white px-4 py-3 shadow-[0_3px_14px_rgba(40,39,109,.04)]"><div className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#eeeaff] text-[#5145ed]">▣</span><div className="min-w-0"><p className="truncate text-sm font-bold text-[#101a35]">{demo.title}</p><p className="text-xs text-[#67738e]">Demo · Sprint {demo.sprint.sprintNumber} · Presenter: {demo.presenterNameSnapshot || "Not assigned"}</p></div></div><Link href={root} className="rounded-lg border border-[#d9d5ef] px-3 py-2 text-xs font-semibold text-[#5145ed] hover:bg-[#f6f4ff]">View demo ↗</Link></div>
    {view === "information" ? <div className="space-y-3">
      <section className="rounded-xl border border-[#d9dff0] bg-white px-4 py-3 shadow-[0_3px_16px_rgba(40,39,109,.04)] sm:px-6"><h2 className="sr-only">Recorded demo information</h2><dl className="space-y-1.5"><Field label="Story / feature title" value={demo.capability && featureTitle !== workTitle ? `${workTitle} · ${featureTitle}` : workTitle} /><Field label="Purpose" value={demo.purpose || "Not recorded"} multiline /><Field label="Engineer" value={engineer} /><Field label="Demo owner" value={demoOwner} /><Field label="Demo status" value={statusLabels[demo.status] ?? demo.status} /><Field label="Notes" value={demo.notes || "No notes recorded"} multiline /><Field label="Sprint" value={`Sprint ${demo.sprint.sprintNumber}`} /><Field label="Completed work" value={demo.completedWork || "Not recorded"} multiline /></dl><p className="mt-2 text-[11px] text-[#67738e]">{readOnly ? "You have read-only access to this demo." : "Edit preparation, readiness, and outcomes in the demo agenda."}</p></section>
      <section className="rounded-xl border border-[#d9dff0] bg-white px-4 py-4 shadow-[0_3px_16px_rgba(40,39,109,.04)] sm:px-6"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg border border-[#dedbea] bg-[#faf9ff] text-[#101a35]">▤</span><div><h2 className="text-sm font-bold text-[#101a35]">Notion notes</h2><p className="text-xs text-[#74809c]">Link a Notion page for demo notes and outcomes.</p></div></div><span className="rounded-full bg-[#f0f1f6] px-3 py-1 text-[11px] font-semibold text-[#56627e]">Not connected</span></div>{linkedNotion ? <div className="mt-4 rounded-lg border border-[#dcd9f6] bg-[#faf9ff] p-4"><p className="text-[11px] font-semibold text-[#5145ed]">Existing evidence link · not synced</p><a href={linkedNotion} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-xs font-semibold text-[#5145ed] underline">Open linked Notion page ↗</a></div> : <div className="mt-4 rounded-lg border border-dashed border-[#d8d4f4] bg-[#fafaff] p-4 text-xs text-[#68748c]">No Notion page linked to this demo.</div>}<div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="max-w-[65ch] whitespace-pre-wrap text-xs leading-5 text-[#687491]"><strong className="block text-[#263252]">Internal notes</strong>{demo.notes || "No notes recorded"}</p><button type="button" disabled className="rounded-lg border border-[#d9d5f4] bg-[#f8f7ff] px-3 py-2 text-xs font-semibold text-[#8c87a7]" title="Available after Notion integration setup">Connect Notion · Coming soon</button></div></section>
    </div> : <ProviderPage provider={view === "google-meet" ? "Google Meet" : "Zoom"} demoTitle={demo.title} agendaHref={root} />}
  </div></main>;
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
  const linkedNotion = notionEvidenceLink(demo.evidenceLinks);
  const bugData = demo.bug?.request.data;
  const bugTitle = bugData && typeof bugData === "object" && !Array.isArray(bugData) && "title" in bugData && typeof bugData.title === "string" ? bugData.title : "Linked bug";
  const workTitle = demo.story?.title ?? (demo.bug ? bugTitle : "No linked story");

  return <DemoDetailContent view={view} demo={demo} root={root} detail={detail} workTitle={workTitle} engineer={namesFor("engineer")} demoOwner={namesFor("demo_owner")} linkedNotion={linkedNotion} readOnly={access.level === "view"} />;
}
