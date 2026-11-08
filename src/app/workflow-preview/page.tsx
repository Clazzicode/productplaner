import GuidedRoadmapPreview from "@/components/questionnaire/GuidedRoadmapPreview";
import PoWorkflowGuide from "@/components/planning/PoWorkflowGuide";
import PlannedMeetingPanel from "@/components/workspace/PlannedMeetingPanel";

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
  return <GuidedRoadmapPreview />;
}
