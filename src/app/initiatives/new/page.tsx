import { redirect } from "next/navigation";
import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import { requireCurrentUser } from "@/lib/auth/session";

/** Keep existing bookmarks and entry points on the unified Features page. */
async function NewFeaturePage() {
  const user = await requireCurrentUser();
  if (user.memberType !== "internal" || !["owner", "admin"].includes(user.permissionRole)) redirect("/initiatives");
  redirect("/initiatives?create=feature");
}

export default withAuthenticatedPage(NewFeaturePage);
