import WelcomeQualifying from "@/components/qualifying/WelcomeQualifying";

export const dynamic = "force-dynamic";

export default function WelcomePage() {
  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto mb-10 max-w-xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
          Step 2 of 3 · Experience calibration
        </p>
        <h1 className="mt-2 text-3xl font-bold">
          From raw idea to execution-ready plan
        </h1>
        <p className="mt-3 text-neutral-500">
          A few quick questions calibrate the experience to you. Then we&apos;ll build your
          working prototype — a live, connected plan, not a document.
        </p>
      </div>
      <WelcomeQualifying />
    </main>
  );
}
