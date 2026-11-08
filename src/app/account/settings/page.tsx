import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import PageHeader from "@/components/ui/PageHeader";
import SettingsForm from "@/components/account/SettingsForm";
import { requireCurrentUser } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Directive item 3: "Allow it to be changed later in Settings if needed" —
 * the account menu's own comment used to say this entry was permanently
 * removed pending "a real personal setting"; experience level and working
 * role are exactly that.
 */
async function AccountSettingsPage() {
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);

  return (
    <ContainedLayout className="max-w-2xl">
      <PageHeader
        eyebrow="Clarivia"
        title="Settings"
        description="One Product Owner workflow. Guidance and tours never change your permissions."
      />
      <SettingsForm />
    </ContainedLayout>
  );
}

export default withAuthenticatedPage(AccountSettingsPage);
