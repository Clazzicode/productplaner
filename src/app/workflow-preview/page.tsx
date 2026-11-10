import GuidedRoadmapPreview from "@/components/questionnaire/GuidedRoadmapPreview";
import PoWorkflowGuide from "@/components/planning/PoWorkflowGuide";
import PlannedMeetingPanel from "@/components/workspace/PlannedMeetingPanel";
import { DemoDetailContent, type DemoDetailView } from "@/components/workspace/DemoDetailPage";

export const metadata = { title: "Guided Roadmap Intake Preview" };

export default async function WorkflowPreviewPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  if (view === "guide" && process.env.NODE_ENV === "development" && process.env.PO_DEMO_ENABLED === "true") {
    return <main className="p-4 sm:p-8"><PoWorkflowGuide initiativeId="local-demo-only" initiativeName="Manual planning guide preview" /></main>;
  }
  if (view === "meeting" && process.env.NODE_ENV === "development" && process.env.PO_DEMO_ENABLED === "true") {
    return <main className="min-h-dvh bg-[#f4f5fe] p-4 sm:p-8"><h1 className="sr-only">Meeting controls preview</h1><div className="mx-auto max-w-md"><PlannedMeetingPanel /></div></main>;
  }
  if (view === "attendance" && process.env.NODE_ENV === "development" && process.env.PO_DEMO_ENABLED === "true") {
    return <main className="min-h-dvh bg-[#f4f5fe] p-4 sm:p-8"><h1 className="sr-only">Attendance preview</h1><div className="mx-auto max-w-3xl"><PlannedMeetingPanel attendance /></div></main>;
  }
  if (view?.startsWith("demo-") && process.env.NODE_ENV === "development" && process.env.PO_DEMO_ENABLED === "true") {
    const demoView: DemoDetailView = view === "demo-meet" ? "google-meet" : view === "demo-zoom" ? "zoom" : "information";
    const demo = { title: "Guided setup checklist", purpose: "Demonstrate the guided setup experience, including workspace creation, initial configuration, and next steps.", status: "preparing", notes: "Focus on the end-to-end flow and key success criteria. Prepare a short fallback if time is limited.", completedWork: "Implemented guided setup flow\nAdded checklist and progress tracking\nUpdated help text and onboarding copy", presenterNameSnapshot: "Jordan Kim", sprint: { sprintNumber: 24 }, capability: { name: "Guided setup checklist" } };
    return <div className="min-h-dvh bg-[#f7f7ff] md:grid md:grid-cols-[220px_minmax(0,1fr)]"><aside className="hidden min-h-dvh bg-[#061635] px-4 py-5 text-sm text-white md:block"><div className="text-lg font-bold">◈ Clarivia</div><div className="mt-10 space-y-5 text-[#d5dbf0]"><p>Roadmap</p><p>Documents</p><p>Teams &amp; Stakeholders</p><p>Integrations</p><p className="text-xs text-[#8497c6]">DELIVER</p><p>Sprint</p><p className="rounded-lg bg-[#5449ed] px-3 py-2 font-semibold text-white">Demos</p><p>PO Validation</p></div></aside><div className="min-w-0"><header className="flex h-14 items-center justify-between border-b border-[#dfe3f2] bg-white px-5 text-xs text-[#263252]"><span className="rounded-lg border border-[#d8def0] px-3 py-2 font-semibold">TaskFlow Studio⌄</span><span>Search &nbsp;&nbsp; Create &nbsp;&nbsp; ♧ &nbsp;&nbsp; A</span></header><DemoDetailContent view={demoView} demo={demo} root="/workflow-preview?view=demo-info" detail="/workflow-preview?view=demo-info" workTitle="Guided setup checklist" engineer="Jordan Kim" demoOwner="Avery Lee" linkedNotion={null} readOnly={false} /></div></div>;
  }
  return <GuidedRoadmapPreview />;
}
