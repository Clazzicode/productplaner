"use client";
import { useCoachMarks } from "@/components/coachmarks/CoachMarkProvider";

export default function SettingsForm() {
  const tour = useCoachMarks();
  return <div className="mt-8 space-y-6">
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold">Product Owner workflow</h2>
      <p className="mt-2 text-sm">Every account uses the same planning tools. Workspace membership and initiative access determine permissions.</p>
    </section>
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold">Optional product tour</h2>
      <p className="mt-2 text-sm">Start a walkthrough when it helps. You can stop it at any time and continue planning manually.</p>
      <button onClick={() => void tour.replay()} className="mt-4 rounded border px-4 py-2 text-sm font-semibold">Start product tour</button>
    </section>
  </div>;
}
