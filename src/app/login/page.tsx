import LoginForm from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto mb-10 max-w-xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
          Guided Product Planning Platform
        </p>
        <h1 className="mt-2 text-3xl font-bold">Sign in</h1>
        <p className="mt-3 text-neutral-500">
          Sign in to your workspace, or create an account to get your own personal workspace.
        </p>
      </div>
      <LoginForm />
    </main>
  );
}
