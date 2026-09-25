import { redirect } from "next/navigation";
import { FocusedLayout } from "@/components/layout/PageLayouts";
import CreateProjectForm from "@/components/projects/CreateProjectForm";
import Breadcrumb from "@/components/ui/Breadcrumb";
import { requireCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const user = await requireCurrentUser();
  if (user.profiles.length === 0) redirect("/welcome");

  return (
    <FocusedLayout>
      <Breadcrumb items={[{ label: "Projects", href: "/projects" }, { label: "New Project" }]} />
      <h1 className="mt-4 text-2xl font-bold">New project</h1>
      <p className="mt-1 mb-8 text-sm text-neutral-500">
        A clean start — nothing here is inherited from any other project. Every initiative you
        create inside it can reuse what you enter here.
      </p>
      <CreateProjectForm />
    </FocusedLayout>
  );
}
