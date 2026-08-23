import OrganizationSetupForm from "@/components/onboarding/OrganizationSetupForm";

export const dynamic = "force-dynamic";

export default function OnboardingOrganizationPage() {
  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto mb-10 max-w-xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
          Step 1 of 2 · Organization setup
        </p>
        <h1 className="mt-2 text-3xl font-bold">Tell us about your organization</h1>
        <p className="mt-3 text-neutral-500">
          A few quick details before we get you into the guided planning questions.
        </p>
      </div>
      <OrganizationSetupForm />
    </main>
  );
}
