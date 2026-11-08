import GuidedRoadmapPreview from "@/components/questionnaire/GuidedRoadmapPreview";
import PoWorkflowGuide from "@/components/planning/PoWorkflowGuide";

export const metadata = { title: "Guided Roadmap Intake Preview" };

export default async function WorkflowPreviewPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  if (view === "guide" && process.env.NODE_ENV === "development" && process.env.PO_DEMO_ENABLED === "true") {
    return <main className="p-4 sm:p-8"><PoWorkflowGuide initiativeId="local-demo-only" initiativeName="Manual planning guide preview" /></main>;
  }
  return <GuidedRoadmapPreview />;
}
