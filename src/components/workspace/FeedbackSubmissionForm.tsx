"use client";

import { useState } from "react";

export default function FeedbackSubmissionForm({ initiativeId }: { initiativeId: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return <section className="rounded-xl border p-5">
    <h2 className="text-xl font-bold">Submit feedback</h2>
    <p className="mt-2 text-sm">Share feedback with the planning team. They review any planning changes separately.</p>
    <form className="mt-4 space-y-4" onSubmit={async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const fields = new FormData(form);
      setPending(true); setMessage("");
      try {
        const response = await fetch(`/api/initiatives/${encodeURIComponent(initiativeId)}/feedback/submissions`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: fields.get("title"), details: fields.get("details") }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Feedback could not be submitted.");
        setMessage(`Feedback received. Receipt: ${data.receipt.id}`); form.reset();
      } catch (error) { setMessage(error instanceof Error ? error.message : "Feedback could not be submitted."); }
      finally { setPending(false); }
    }}>
      <label className="block">Title<input name="title" required minLength={3} maxLength={300} className="mt-1 block w-full rounded border p-2" /></label>
      <label className="block">Feedback<textarea name="details" required minLength={3} maxLength={30000} rows={6} className="mt-1 block w-full rounded border p-2" /></label>
      <button disabled={pending} className="rounded border px-4 py-2 disabled:opacity-50">{pending ? "Submitting…" : "Submit feedback"}</button>
      <p role="status" aria-live="polite">{message}</p>
    </form>
  </section>;
}
