"use client";

/** First onboarding question: Solo vs Team/Organization. Picking Solo skips the
 * org name/size/industry fields entirely — a solo workspace already exists from
 * signup (provisionSoloWorkspace), so there's nothing else to collect. */
export default function WorkspaceTypeStep(props: { onPick: (value: "solo" | "team") => void }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => props.onPick("solo")}
          className="rounded-2xl border border-neutral-200 bg-white p-5 text-left transition hover:border-indigo-400 hover:bg-indigo-50"
        >
          <h3 className="font-semibold">Just me</h3>
          <p className="mt-1 text-sm text-neutral-500">Solo — planning on your own.</p>
        </button>
        <button
          type="button"
          onClick={() => props.onPick("team")}
          className="rounded-2xl border border-neutral-200 bg-white p-5 text-left transition hover:border-indigo-400 hover:bg-indigo-50"
        >
          <h3 className="font-semibold">Team / Organization</h3>
          <p className="mt-1 text-sm text-neutral-500">Planning with a team or a company.</p>
        </button>
      </div>
    </div>
  );
}
