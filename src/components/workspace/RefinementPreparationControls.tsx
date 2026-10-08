"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";

type StoryOption = { id: string; title: string };
type MemberOption = { id: string; name: string };

const categories = [
  ["missing_information", "Missing information"],
  ["engineering_question", "Engineering question"],
  ["contradiction", "Contradiction"],
  ["dependency", "Dependency"],
  ["scope", "Scope"],
  ["acceptance_criteria", "Acceptance criteria"],
  ["blocker", "Blocker"],
  ["other", "Other"],
] as const;

export default function RefinementPreparationControls({
  initiativeId,
  stories,
  members,
}: {
  initiativeId: string;
  stories: StoryOption[];
  members: MemberOption[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [storyId, setStoryId] = useState(stories[0]?.id ?? "");
  const [category, setCategory] = useState("engineering_question");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");

  async function syncChecks() {
    setBusy(true);
    setMessage("");
    const result = await apiFetch<{ result: { detected: number; created: number } }>(
      `/api/initiatives/${initiativeId}/refinement-findings/sync`,
      { method: "POST" },
    );
    setBusy(false);
    if (!result.ok) return setMessage(result.error ?? "Could not refresh deterministic checks.");
    setMessage(`${result.data?.result.created ?? 0} new findings added from ${result.data?.result.detected ?? 0} detected concerns.`);
    router.refresh();
  }

  async function createFinding(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const result = await apiFetch(`/api/initiatives/${initiativeId}/refinement-findings`, {
      method: "POST",
      body: {
        storyId,
        category,
        title,
        detail,
        ownerUserId: ownerUserId || null,
        followUpNote,
        followUpAt: followUpAt ? new Date(`${followUpAt}T12:00:00Z`).toISOString() : null,
      },
    });
    setBusy(false);
    if (!result.ok) return setMessage(result.error ?? "Could not create the finding.");
    setTitle("");
    setDetail("");
    setFollowUpNote("");
    setFollowUpAt("");
    setShowForm(false);
    setMessage("Refinement finding added.");
    router.refresh();
  }

  return <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={syncChecks} disabled={busy || stories.length === 0} className="rounded bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Refresh deterministic checks</button>
      <button type="button" onClick={() => setShowForm(value => !value)} disabled={stories.length === 0} className="rounded border px-3 py-2 text-xs font-semibold">{showForm ? "Cancel" : "Add finding or engineering question"}</button>
    </div>
    <p className="mt-2 text-xs text-slate-500">Deterministic checks inspect acceptance criteria conflicts and unresolved feature dependencies. They do not call AI or change story content.</p>
    {showForm && <form onSubmit={createFinding} className="mt-4 grid gap-3 md:grid-cols-2">
      <select value={storyId} onChange={event => setStoryId(event.target.value)} required className="rounded border p-2 text-sm">{stories.map(story => <option key={story.id} value={story.id}>{story.title}</option>)}</select>
      <select value={category} onChange={event => setCategory(event.target.value)} className="rounded border p-2 text-sm">{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <input value={title} onChange={event => setTitle(event.target.value)} required minLength={3} maxLength={160} placeholder="Finding or question title" className="rounded border p-2 text-sm md:col-span-2" />
      <textarea value={detail} onChange={event => setDetail(event.target.value)} required minLength={3} maxLength={2000} placeholder="What needs clarification and why it matters" className="rounded border p-2 text-sm md:col-span-2" />
      <select value={ownerUserId} onChange={event => setOwnerUserId(event.target.value)} className="rounded border p-2 text-sm"><option value="">Unassigned</option>{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
      <input type="date" value={followUpAt} onChange={event => setFollowUpAt(event.target.value)} className="rounded border p-2 text-sm" />
      <input value={followUpNote} onChange={event => setFollowUpNote(event.target.value)} maxLength={2000} placeholder="Next action or engineering follow-up" className="rounded border p-2 text-sm md:col-span-2" />
      <button type="submit" disabled={busy} className="rounded bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 md:col-span-2">Add to refinement agenda</button>
    </form>}
    {message && <p className="mt-2 text-xs text-slate-600">{message}</p>}
  </div>;
}
