"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";

type Criterion = { id: string; title: string; approved: boolean };

export default function StoryWorkflowControls({
  initiativeId,
  storyId,
  backlogRevision,
  readinessStatus,
  criteria,
}: {
  initiativeId: string;
  storyId: string;
  backlogRevision: number;
  readinessStatus: string;
  criteria: Criterion[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedReadiness, setSelectedReadiness] = useState(readinessStatus);
  const [readinessReason, setReadinessReason] = useState("");
  const [acTitle, setAcTitle] = useState("");
  const [acBody, setAcBody] = useState("");
  const [splitting, setSplitting] = useState(false);
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");

  async function act(path: string, body: unknown) {
    setBusy(true);
    setError("");
    const result = await apiFetch(path, { method: "POST", body });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function saveReadiness() {
    setBusy(true);
    setError("");
    const result = await apiFetch(
      `/api/initiatives/${initiativeId}/stories/${storyId}`,
      {
        method: "PATCH",
        body: {
          expectedRevision: backlogRevision,
          readinessStatus: selectedReadiness,
          reason: readinessReason,
        },
      },
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not update readiness.");
      return;
    }
    setReadinessReason("");
    router.refresh();
  }

  async function addCriterion() {
    if (await act(`/api/initiatives/${initiativeId}/stories/${storyId}/criteria`, {
      title: acTitle,
      body: acBody,
      sourceType: "manual",
    })) {
      setAcTitle("");
      setAcBody("");
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const ordered = criteria.map((criterion) => criterion.id);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    await act(
      `/api/initiatives/${initiativeId}/stories/${storyId}/criteria/reorder`,
      { orderedIds: ordered },
    );
  }

  const parseSplit = (value: string) => {
    const [title, ...body] = value.split("|");
    return { title: title.trim(), body: body.join("|").trim(), points: null };
  };
  const splitStories = [parseSplit(first), parseSplit(second)];
  const canSplit = splitStories.every(
    (story) => story.title.length >= 3 && story.body.length > 0,
  );
  const readinessChanged = selectedReadiness !== readinessStatus;

  return (
    <section className="mt-6 space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/30 p-4">
      <div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_minmax(220px,2fr)_auto] md:items-end">
        <label className="text-sm font-semibold">
          Story readiness
          <select
            value={selectedReadiness}
            onChange={(event) => setSelectedReadiness(event.target.value)}
            disabled={busy}
            className="mt-1 block w-full rounded border bg-white p-2 text-sm"
          >
            <option value="needs_refinement">Needs refinement</option>
            <option value="ready_for_refinement">Ready for refinement</option>
            <option value="sprint_ready">Sprint ready</option>
            <option value="blocked">Blocked</option>
          </select>
        </label>
        <label className="text-xs font-medium text-neutral-600">
          Reason for readiness change
          <input
            value={readinessReason}
            onChange={(event) => setReadinessReason(event.target.value)}
            placeholder="What changed or remains blocked?"
            className="mt-1 w-full rounded border bg-white p-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={saveReadiness}
          disabled={busy || !readinessChanged || readinessReason.trim().length < 3}
          className="rounded bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Save readiness
        </button>
      </div>

      <button
        type="button"
        onClick={() => setSplitting((value) => !value)}
        className="text-xs font-semibold text-indigo-700"
      >
        Split story
      </button>
      {splitting && (
        <div className="grid gap-2 md:grid-cols-2">
          <textarea
            aria-label="First split story"
            value={first}
            onChange={(event) => setFirst(event.target.value)}
            placeholder="First story: title | As a…, I want…, so that…"
            className="rounded border p-2 text-sm"
          />
          <textarea
            aria-label="Second split story"
            value={second}
            onChange={(event) => setSecond(event.target.value)}
            placeholder="Second story: title | As a…, I want…, so that…"
            className="rounded border p-2 text-sm"
          />
          <button
            type="button"
            disabled={busy || !canSplit}
            className="rounded bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            onClick={() =>
              void act(
                `/api/initiatives/${initiativeId}/stories/${storyId}/split`,
                { stories: splitStories },
              )
            }
          >
            Create split stories
          </button>
        </div>
      )}

      <div>
        <h4 className="text-sm font-semibold">Acceptance criteria</h4>
        {criteria.map((criterion, index) => (
          <div
            key={criterion.id}
            className="mt-2 flex items-center justify-between rounded bg-white p-2 text-xs"
          >
            <span>
              {criterion.title}{" "}
              {criterion.approved && (
                <strong className="text-emerald-700">· Approved</strong>
              )}
            </span>
            <span className="flex gap-2">
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0}>
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === criteria.length - 1}
              >
                ↓
              </button>
            </span>
          </div>
        ))}
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <input
          aria-label="Criterion title"
          value={acTitle}
          onChange={(event) => setAcTitle(event.target.value)}
          placeholder="Criterion title"
          className="rounded border p-2 text-sm"
        />
        <textarea
          aria-label="Criterion outcome"
          value={acBody}
          onChange={(event) => setAcBody(event.target.value)}
          placeholder="Given … When … Then …"
          className="rounded border p-2 text-sm"
        />
        <button
          type="button"
          disabled={busy || !acTitle.trim() || !acBody.trim()}
          onClick={addCriterion}
          className="rounded bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Add criterion
        </button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </section>
  );
}
