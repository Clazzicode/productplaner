import Link from "next/link";
import { notFound } from "next/navigation";
import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import { requireCurrentUser } from "@/lib/auth/session";
import { listAuthorizedInitiativeIds } from "@/lib/access/initiativeAccess";
import { db, establishAuthContext } from "@/lib/db";
import { listUnifiedBacklog } from "@/lib/backlog/unified";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import Breadcrumb from "@/components/ui/Breadcrumb";

async function FeatureBacklogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  const backlog = await db.backlog.findUnique({
    where: { id }, select: { id: true, name: true, organizationId: true, project: { select: { id: true, name: true } } },
  });
  if (!backlog || backlog.organizationId !== user.organizationId) notFound();
  const authorizedIds = await listAuthorizedInitiativeIds(user);
  const features = await db.initiative.findMany({
    where: { backlogId: id, id: { in: authorizedIds ?? [] }, organizationId: user.organizationId },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  if (!features.length) notFound();
  const sections = await Promise.all(features.map(async feature => ({
    ...feature, items: await listUnifiedBacklog(feature.id),
  })));

  return <ContainedLayout>
    <Breadcrumb items={[{ label: "Products", href: "/projects" }, { label: backlog.project.name, href: `/projects/${backlog.project.id}` }, { label: backlog.name }]} />
    <div className="mt-5">
      <h1 className="text-3xl font-bold text-slate-950">{backlog.name}</h1>
      <p className="mt-2 text-sm text-slate-600">Work connected to this feature’s backlog. Open the feature to edit its work.</p>
    </div>
    <div className="mt-6 space-y-5">
      {sections.map(section => <section key={section.id} className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold text-slate-950">{section.name}</h2><p className="text-xs text-slate-500">{section.items.length} backlog items</p></div>
          <Link href={`/initiatives/${section.id}/backlog`} className="text-sm font-semibold text-indigo-700 hover:underline">Manage this feature’s work →</Link>
        </div>
        {section.items.length ? <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          {section.items.map(item => <li key={`${item.recordType}:${item.id}`} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
            <div className="min-w-0"><p className="font-medium text-slate-900">{item.title}</p><p className="mt-1 text-xs capitalize text-slate-500">{item.workType.replaceAll("_", " ")} · {item.status.replaceAll("_", " ")}</p></div>
            <span className="text-xs text-slate-600">{item.owner?.name ?? "Unassigned"}</span>
          </li>)}
        </ul> : <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-500">No work recorded for this feature yet.</p>}
      </section>)}
    </div>
  </ContainedLayout>;
}

export default withAuthenticatedPage(FeatureBacklogPage);
