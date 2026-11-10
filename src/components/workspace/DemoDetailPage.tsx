import Link from "next/link";
import { notFound } from "next/navigation";
import { requireInitiativeView } from "@/lib/access/guards";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { demoInclude } from "@/lib/demos/service";
import { notionEvidenceLink } from "@/lib/demos/notionLink";
import DemoMeetingManager from "@/components/workspace/DemoMeetingManager";
import GoogleCalendarPanel from "@/components/workspace/GoogleCalendarPanel";

export type DemoDetailView = "information" | "google-meet" | "zoom" | "google-calendar";

const statusLabels: Record<string, string> = {
  proposed: "Proposed", preparing: "Preparing", ready: "Ready", not_ready: "Not ready",
  demonstrated: "Demonstrated", skipped: "Skipped", carried_over: "Carried over",
};

function Field({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={`grid gap-2 border-b border-[#e8eaf3] py-3 last:border-b-0 sm:grid-cols-[155px_minmax(0,1fr)] ${wide ? "sm:col-span-2" : ""}`}>
    <dt className="text-xs font-semibold text-[#26345a]">{label}</dt>
    <dd className={`min-w-0 whitespace-pre-wrap text-sm ${value.startsWith("Not ") || value === "No notes recorded" ? "text-[#74809a]" : "text-[#111a32]"}`}>{value}</dd>
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
    { view: "google-calendar", label: "Google Calendar", href: `${detail}/google-calendar` },
  ];
  const linkedNotion = notionEvidenceLink(demo.evidenceLinks);
  const provider = view === "google-meet" ? "google_meet" : view === "zoom" ? "zoom" : null;
  const meetingWork = provider ? await db.planningMeetingWorkItem.findMany({ where: { organizationId: demo.organizationId, demoItemId: demo.id }, select: { meetingId: true } }) : [];
  const meetings = provider ? await db.planningMeeting.findMany({
    where: { id: { in: meetingWork.map((item) => item.meetingId) }, organizationId: demo.organizationId, provider },
    orderBy: { scheduledAt: "desc" },
  }) : [];
  const participants = meetings.length ? await db.planningMeetingParticipant.findMany({
    where: { organizationId: demo.organizationId, meetingId: { in: meetings.map((item) => item.id) } },
  }) : [];
  const connections = await db.personalIntegrationConnection.findMany({ where: { organizationId: demo.organizationId, userId: user.id } });
  const featureTitle = demo.capability?.name ?? "No linked feature";
  const bugData = demo.bug?.request.data;
  const bugTitle = bugData && typeof bugData === "object" && !Array.isArray(bugData) && "title" in bugData && typeof bugData.title === "string" ? bugData.title : "Linked bug";
  const workTitle = demo.story?.title ?? (demo.bug ? bugTitle : "No linked story");

  return <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
    <nav aria-label="Demo location" className="text-xs text-[#5b6680]"><Link href={root} className="font-semibold text-[#5145ed] hover:underline">Demos</Link><span className="mx-2">/</span><span>{demo.title}</span></nav>
    <div className="mt-3 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-bold tracking-tight text-[#101a35]">{view === "information" ? "Demo information" : view === "google-meet" ? "Google Meet" : view === "zoom" ? "Zoom" : "Google Calendar"}</h1><p className="mt-1 text-sm text-[#66718b]">{view === "information" ? "Review the committed work and the recorded demo details." : view === "google-calendar" ? "See your connected Google Calendar schedule." : "Schedule the call, invite guests, and record its activity and notes."}</p></div></div>
    <nav aria-label="Demo detail pages" className="mt-6 flex gap-2 overflow-x-auto border-b border-[#dfe3f2]">{tabs.map(tab => <Link key={tab.view} href={tab.href} aria-current={view === tab.view ? "page" : undefined} className={`shrink-0 border-b-[3px] px-4 py-3 text-sm font-semibold ${view === tab.view ? "border-[#5145ed] text-[#5145ed]" : "border-transparent text-[#3b4560] hover:text-[#5145ed]"}`}>{tab.label}</Link>)}</nav>
    <div className="my-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dfe3f2] bg-white p-4 shadow-sm"><div><p className="text-sm font-bold text-[#101a35]">{demo.title}</p><p className="mt-0.5 text-xs text-[#67738e]">{workTitle} · {featureTitle} · Sprint {demo.sprint.sprintNumber}</p></div><Link href={root} className="rounded-lg border border-[#d9d5ef] px-3 py-2 text-xs font-semibold text-[#5145ed] hover:bg-[#f6f4ff]">View demo agenda ↗</Link></div>
    {view === "google-calendar" ? <GoogleCalendarPanel accountEmail={connections.find((item) => item.provider === "google_calendar")?.accountEmail ?? null} /> : view === "information" ? <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
      <section className="rounded-2xl border border-[#dfe3f2] bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold text-[#101a35]">Demo record</h2><span className="rounded-full bg-[#eeeaff] px-3 py-1 text-xs font-semibold text-[#5145ed]">{statusLabels[demo.status] ?? demo.status}</span></div><dl className="mt-4"><Field label="Story / feature title" value={`${workTitle} / ${featureTitle}`} /><Field label="Purpose" value={demo.purpose || "Not recorded"} /><Field label="Engineer" value={namesFor("engineer")} /><Field label="Demo owner" value={namesFor("demo_owner")} /><Field label="Presenter" value={demo.presenterNameSnapshot || "Not assigned"} /><Field label="Demo status" value={statusLabels[demo.status] ?? demo.status} /><Field label="Notes" value={demo.notes || "No notes recorded"} /><Field label="Sprint" value={`Sprint ${demo.sprint.sprintNumber}`} /><Field label="Completed work" value={demo.completedWork || "Not recorded"} /></dl><p className="mt-4 text-xs text-[#67738e]">{access.level === "view" ? "You have read-only access to this demo." : "Edit preparation, readiness, and outcomes from the existing demo agenda."}</p></section>
      <section className="h-fit rounded-2xl border border-[#dfe3f2] bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#5145ed]">Notes</p><h2 className="mt-1 text-lg font-bold text-[#101a35]">Notion notes</h2></div><span className="rounded-full bg-[#f0f1f6] px-2 py-1 text-xs font-semibold text-[#56627e]">Optional</span></div><p className="mt-3 text-sm text-[#67738e]">Connect Notion from Integrations, then import page notes on a Google Meet or Zoom meeting page. Internal demo notes remain available here.</p>{linkedNotion ? <div className="mt-5 rounded-xl border border-[#dcd9f6] bg-[#faf9ff] p-4"><p className="text-xs font-semibold text-[#5145ed]">Existing evidence link · not synced</p><a href={linkedNotion} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-sm font-semibold text-[#101a35] underline">Open linked Notion page ↗</a></div> : <div className="mt-5 rounded-xl border border-dashed border-[#d8d4f4] p-5 text-center text-sm text-[#68748c]">No Notion page linked to this demo.</div>}<Link href="/integrations" className="mt-5 inline-block rounded-lg border border-indigo-300 px-4 py-2.5 text-sm font-semibold text-indigo-700">Manage Notion connection</Link></section>
    </div> : <DemoMeetingManager
      initiativeId={initiativeId} demoId={demo.id} demoTitle={demo.title} provider={provider!}
      calendarConnected={connections.some((item) => item.provider === "google_calendar")}
      calendarEmail={connections.find((item) => item.provider === "google_calendar")?.accountEmail ?? null}
      zoomConnected={connections.some((item) => item.provider === "zoom")}
      zoomEmail={connections.find((item) => item.provider === "zoom")?.accountEmail ?? null}
      notionConnected={connections.some((item) => item.provider === "notion")}
      canEdit={access.level !== "view"}
      canUseIntegrations={access.level !== "view"}
      meetings={meetings.map((meeting) => ({
        id: meeting.id, title: meeting.title, isOrganizer: meeting.createdByUserId === user.id, scheduledAt: meeting.scheduledAt?.toISOString() ?? null,
        scheduledEndAt: meeting.scheduledEndAt?.toISOString() ?? null, joinUrl: meeting.joinUrl,
        status: meeting.status, notes: meeting.notes, transcriptText: meeting.transcriptText,
        transcriptSource: meeting.transcriptSource as "provider" | "imported" | "manual" | null,
        summary: meeting.summary, actualStartedAt: meeting.actualStartedAt?.toISOString() ?? null,
        actualEndedAt: meeting.actualEndedAt?.toISOString() ?? null,
        participants: participants.filter((person) => person.meetingId === meeting.id).map((person) => ({
          name: person.participantNameSnapshot, email: person.participantEmailSnapshot,
          status: person.attendanceStatus, providerDisplayName: person.providerDisplayName,
          joinedAt: person.joinedAt?.toISOString() ?? null, leftAt: person.leftAt?.toISOString() ?? null,
        })),
      }))}
    />}
  </main>;
}
