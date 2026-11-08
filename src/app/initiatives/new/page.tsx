import { redirect } from "next/navigation";
import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import { FocusedLayout } from "@/components/layout/PageLayouts";
import GeneralIntakeForm from "@/components/questionnaire/GeneralIntakeForm";
import Breadcrumb from "@/components/ui/Breadcrumb";
import { requireCurrentUser } from "@/lib/auth/session";

async function NewInitiativePage() {
  const user = await requireCurrentUser();
  if (user.memberType !== "internal" || !["owner", "admin"].includes(user.permissionRole)) redirect("/initiatives");
  return <FocusedLayout>
    <Breadcrumb items={[{ label: "Initiatives", href: "/initiatives" }, { label: "New initiative" }]} />
    <h1 className="my-4 text-2xl font-semibold">New initiative</h1>
    <p className="mb-5">Start with a name. Save what you know and develop the planning work at your own pace.</p>
    <GeneralIntakeForm storageScope={`${user.id}:${user.organizationId}`} />
  </FocusedLayout>;
}
export default withAuthenticatedPage(NewInitiativePage);
