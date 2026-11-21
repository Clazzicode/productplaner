import Link from "next/link";
import { redirect } from "next/navigation";
import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import { FocusedLayout } from "@/components/layout/PageLayouts";
import Breadcrumb from "@/components/ui/Breadcrumb";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";

async function NewFeaturePage() {
  const user = await requireCurrentUser();
  if (user.memberType !== "internal" || !["owner", "admin"].includes(user.permissionRole)) redirect("/initiatives");
  establishAuthContext(user.authUserId);
  const products = await db.project.findMany({
    where: { organizationId: user.organizationId },
    select: { id: true, name: true, description: true },
    orderBy: { name: "asc" },
  });
  return <FocusedLayout>
    <Breadcrumb items={[{ label: "Features", href: "/initiatives" }, { label: "New feature" }]} />
    <h1 className="my-4 text-2xl font-semibold">Choose a product</h1>
    <p className="mb-5 text-sm text-slate-600">A feature belongs to a product. Choose where this feature will live, then add its details.</p>
    {products.length ? <ul className="space-y-3">
      {products.map(product => <li key={product.id}>
        <Link href={`/projects/${product.id}/initiatives/new`} className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-indigo-400 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-500">
          <span className="font-semibold text-slate-900">{product.name}</span>
          {product.description && <span className="mt-1 block text-sm text-slate-600">{product.description}</span>}
        </Link>
      </li>)}
    </ul> : <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">No products yet. Create one before adding a feature.</p>}
    <Link href="/projects/new" className="mt-5 inline-flex rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">+ New product</Link>
  </FocusedLayout>;
}
export default withAuthenticatedPage(NewFeaturePage);
