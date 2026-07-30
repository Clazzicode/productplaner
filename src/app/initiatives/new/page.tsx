import Link from "next/link";
import { redirect } from "next/navigation";
import NewInitiativeForm from "@/components/intake/NewInitiativeForm";
import { getActiveProfile } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function NewInitiativePage() {
  const profile = await getActiveProfile();
  if (!profile) redirect("/welcome");

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-12">
      <Link href="/home" className="text-sm text-neutral-500 hover:text-neutral-800">
        ← Back to initiatives
      </Link>
      <h1 className="mt-4 text-2xl font-bold">New initiative</h1>
      <p className="mt-1 mb-8 text-sm text-neutral-500">
        No blank templates ahead — naming the idea leads straight into the guided intake.
      </p>
      <NewInitiativeForm />
    </main>
  );
}
