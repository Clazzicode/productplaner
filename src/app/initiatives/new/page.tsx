import Link from "next/link";
import { redirect } from "next/navigation";
import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { FocusedLayout } from "@/components/layout/PageLayouts";
import Breadcrumb from "@/components/ui/Breadcrumb";

async function NewFeaturePage() {
  const user = await requireCurrentUser();
  if (user.memberType !== "internal" || !["owner", "admin"].includes(user.permissionRole)) redirect("/projects");
  establishAuthContext(user.authUserId);
  const products = await db.project.findMany({
    where: { organizationId: user.organizationId },
    select: { id: true, name: true, goal: true },
    orderBy: { name: "asc" },
  });

  return <FocusedLayout className="max-w-3xl">
    <Breadcrumb items={[{ label: "Products", href: "/projects" }, { label: "New feature" }]} />
    <h1 className="mt-5 text-3xl font-bold text-[#0d1b3e]">Which product is this feature for?</h1>
    <p className="mt-2 text-sm text-slate-600">Every feature belongs to one product and gets its own backlog automatically.</p>
    {products.length ? <ul className="mt-7 space-y-3">
      {products.map(product => <li key={product.id}>
        <Link href={`/projects/${product.id}/initiatives/new`} className="group flex min-h-20 items-center justify-between gap-4 rounded-xl border border-[#dfe3f4] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#a9a9fa] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5145ed]">
          <span className="min-w-0"><span className="block font-semibold text-[#0d1b3e] group-hover:text-[#5145ed]">{product.name}</span><span className="mt-1 block line-clamp-2 text-sm text-slate-600">{product.goal || "Choose this product to continue."}</span></span>
          <span className="shrink-0 text-sm font-semibold text-[#5145ed]">Choose →</span>
        </Link>
      </li>)}
    </ul> : <div className="mt-7 rounded-xl border border-dashed border-[#ccd2e8] bg-white p-6">
      <p className="text-sm text-slate-600">Create a product before adding its first feature.</p>
      <Link href="/projects/new" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[#5145ed] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4238d7]">Create product</Link>
    </div>}
  </FocusedLayout>;
}

export default withAuthenticatedPage(NewFeaturePage);
