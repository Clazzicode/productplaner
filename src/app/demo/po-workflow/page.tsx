import { notFound } from "next/navigation";
import RequestWorkspace from "@/components/requests/RequestWorkspace";
import { demoRequests, poDemoEnabled } from "@/lib/requests/demo";
import BacklogWorkspace from "@/components/backlog/BacklogWorkspace";
import { poFeatureRecords } from "@/lib/backlog/poFeatures";

export default function PoWorkflowDemo() {
  if (!poDemoEnabled()) notFound();
  return <main className="mx-auto min-h-screen max-w-7xl bg-slate-50 px-5 py-8 sm:px-8">
    <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">Guided Planning · Product Owner</p>
    <h1 className="mt-2 text-3xl font-bold text-slate-950">From request to a clear priority</h1>
    <p className="mb-7 mt-2 text-slate-600">Demo features 1, 2 and 6: capture a request, resolve open questions, and explain what comes next.</p>
    <RequestWorkspace initiativeId="local-demo" initialRequests={demoRequests()} canEdit demo />
    <div className="mb-6 mt-12 space-y-2">
      <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">Features 4, 5 and 7</p>
      <h2 className="text-2xl font-bold text-slate-950">A connected feature backlog and roadmap</h2>
      <p className="text-slate-600">Edit a feature, reorder the backlog, then view the same records in Now, Next, and Later.</p>
    </div>
    <BacklogWorkspace initiativeId="local-demo" initialFeatures={poFeatureRecords()} canEdit demo />
  </main>;
}
