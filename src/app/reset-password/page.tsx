import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const dynamic = "force-dynamic";
export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email_confirmed_at) redirect("/login?authError=link");
  return <main className="mx-auto max-w-md px-6 py-12">
    <h1 className="mb-6 text-2xl font-bold">Choose a new password</h1>
    <ResetPasswordForm />
  </main>;
}
