import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import { redirect } from "next/navigation";

async function RootPage() {
  // Identity and workspace membership are resolved by the wrapper. Experience
  // profiles and generation history never control access to planning work.
  redirect("/home");
}
export default withAuthenticatedPage(RootPage);
