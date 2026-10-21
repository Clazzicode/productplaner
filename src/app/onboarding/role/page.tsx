import WorkingRoleSelector from "@/components/onboarding/WorkingRoleSelector";

export const dynamic = "force-dynamic";

export default function OnboardingRolePage() {
  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto mb-10 max-w-xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
          Step 3 of 3 · Working role
        </p>
        <h1 className="mt-2 text-3xl font-bold">Your Product Owner workspace</h1>
        <p className="mt-3 text-neutral-500">
          Product Owner is the available working experience. Organization access is managed separately.
        </p>
      </div>
      <WorkingRoleSelector />
    </main>
  );
}
