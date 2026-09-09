import LoginForm from "@/components/auth/LoginForm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true },
  });

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto mb-10 max-w-xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
          Guided Product Planning Platform
        </p>
        <h1 className="mt-2 text-3xl font-bold">Choose an account</h1>
        <p className="mt-3 text-neutral-500">
          No password required — pick an account to continue, or create one to keep your own
          settings (like your Anthropic API key) separate.
        </p>
      </div>
      <LoginForm users={users} />
    </main>
  );
}
