import { redirect } from "next/navigation";
import { getActiveProfile } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const profile = await getActiveProfile();
  redirect(profile ? "/home" : "/welcome");
}
