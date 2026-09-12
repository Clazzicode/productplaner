import { redirect } from "next/navigation";
import AdminShell from "@/components/shell/AdminShell";
import { requireCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Guided-activation restructure (reference doc §12): every /admin/* route
 * now renders inside its own separate administrative environment instead of
 * the standard product shell (see bareMode.ts's `/admin` rule, which makes
 * AppShell render nothing for these routes). This guard mirrors the check
 * every individual admin page already makes on its own (admin/page.tsx,
 * admin/users, admin/access, admin/dashboard-configuration) — kept here too
 * so the admin chrome itself never flashes for a non-admin, but each page's
 * own check is left in place untouched (redundant, not harmful, and this
 * layout is a UI convenience, not the real authorization boundary — see
 * AdminShell's doc comment).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCurrentUser();
  if (user.profiles.length === 0) redirect("/welcome");
  if (user.accessLevel !== "org_admin" || user.status !== "active") redirect("/home");

  return <AdminShell>{children}</AdminShell>;
}
