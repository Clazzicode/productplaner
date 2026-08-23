import WorkingRoleSelector from "@/components/onboarding/WorkingRoleSelector";

export const dynamic = "force-dynamic";

export default function OnboardingRolePage() {
  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto mb-10 max-w-xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
          Step 2 of 2 · Working role
        </p>
        <h1 className="mt-2 text-3xl font-bold">How do you primarily work?</h1>
        <p className="mt-3 text-neutral-500">
          This shapes what your dashboard emphasizes later — it doesn&apos;t change what you can
          access.
        </p>
      </div>
      <WorkingRoleSelector />
    </main>
  );
}
