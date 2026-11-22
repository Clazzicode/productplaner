import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import DemoDetailPage from "@/components/workspace/DemoDetailPage";

export const dynamic = "force-dynamic";

async function Page({ params }: { params: Promise<{ initiativeId: string; demoId: string }> }) {
  const { initiativeId, demoId } = await params;
  return <DemoDetailPage initiativeId={initiativeId} demoId={demoId} view="google-meet" />;
}

export default withAuthenticatedPage(Page);
