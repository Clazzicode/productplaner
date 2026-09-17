"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { ButtonLoader, GenerationProgress } from "@/components/ui/loading";
import { apiFetch, uploadFile } from "@/lib/clientApi";
import { SUPPORTED_IMPORT_EXTENSIONS, MAX_IMPORT_FILE_BYTES } from "@/lib/documents/constants";
import { depthFromExperience } from "@/lib/questionnaire/roleGuidance";

// Document Import & Approved Context (directive §3). One shared review
// component used from all three entry points (Project Home, the initiative
// workspace's "Documents" tab, and initiative-creation-time import) — same
// upload -> honest progress -> grouped review -> approve/edit/reject/
// resolve-conflict -> readiness flow everywhere, never a second data path.

export type DocumentScope = "project_shared" | "initiative_only";

interface ContextItemView {
  id: string;
  fieldKey: string;
  kind: "explicit" | "interpretation";
  valueJson: string;
  sourceExcerpt: string;
  sourceHeading: string | null;
  sourcePageNumber: number | null;
  sourceSlideNumber: number | null;
  status: "extracted" | "needs_review" | "approved" | "rejected" | "conflict" | "needs_clarification";
  conflictWithItemId: string | null;
  conflictWithItem: ContextItemView | null;
  conflictsWithExistingValueText: string | null;
  approvedValueText: string | null;
}

interface DocumentView {
  id: string;
  fileName: string;
  fileExt: string;
  scope: DocumentScope;
  status: "uploaded" | "extracted" | "analyzed" | "failed";
  processingError: string | null;
}

interface ReviewData {
  document: DocumentView;
  items: ContextItemView[];
  gaps: string[];
  readiness: "context_ready" | "context_needs_review";
}

const FIELD_LABELS: Record<string, string> = {
  project_name: "Project name",
  description: "Description",
  goal: "Goal",
  budget: "Budget",
  projected_go_live: "Projected go-live",
  team: "Team",
  constraints: "Constraints",
  stakeholders: "Stakeholders",
  initiative_name: "Initiative name",
  initiative_goal: "Initiative goal",
  success_measure: "Success measure",
  initiative_target_date: "Initiative target date",
  feature: "Feature",
  risk: "Risk",
  dependency: "Dependency",
  assumption: "Assumption",
};

const UPLOAD_STEPS = ["Uploading your document", "Storing your document", "Reading and analyzing your document"];

function fieldLabel(fieldKey: string): string {
  return FIELD_LABELS[fieldKey] ?? fieldKey;
}

function displayValue(fieldKey: string, valueJson: string): string {
  if (fieldKey === "feature") {
    try {
      const f = JSON.parse(valueJson) as { name?: string; description?: string };
      return f.description ? `${f.name} — ${f.description}` : (f.name ?? valueJson);
    } catch {
      return valueJson;
    }
  }
  if (fieldKey === "risk") {
    try {
      const r = JSON.parse(valueJson) as { description?: string; severity?: string };
      return r.severity ? `${r.description} (${r.severity})` : (r.description ?? valueJson);
    } catch {
      return valueJson;
    }
  }
  if (fieldKey === "budget") {
    const n = Number(valueJson);
    return Number.isFinite(n) ? `$${n.toLocaleString()}` : valueJson;
  }
  return valueJson;
}

function sourceLabel(item: ContextItemView): string {
  const parts: string[] = [];
  if (item.sourceHeading) parts.push(`"${item.sourceHeading}"`);
  if (item.sourcePageNumber != null) parts.push(`page ${item.sourcePageNumber}`);
  if (item.sourceSlideNumber != null) parts.push(`slide ${item.sourceSlideNumber}`);
  return parts.join(", ");
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  approved: "emerald",
  rejected: "neutral",
  conflict: "red",
  needs_review: "amber",
  needs_clarification: "amber",
  extracted: "neutral",
};

export default function DocumentReviewPanel(props: {
  scope: DocumentScope;
  projectId: string;
  initiativeId?: string | null;
  projectName?: string;
  /** Only the initiative-creation-time entry point offers a real choice —
   * every other entry point's scope is already implied by where it's
   * reached from. */
  allowScopeChoice?: boolean;
  experienceLevel?: string | null;
  onContextChanged?: () => void;
  /** Directive item 29: once context is reviewed, show it's ready and offer
   * an explicit next step — never auto-advance into generation. Omitted
   * where there's no natural "next" (e.g. the standalone workspace
   * Documents tab, which IS the destination already). */
  continueHref?: string;
  continueLabel?: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const verbose = depthFromExperience(props.experienceLevel);

  const [selectedScope, setSelectedScope] = useState<DocumentScope>(props.scope);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReviewData | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(new Set());

  const notify = () => {
    props.onContextChanged?.();
    router.refresh();
  };

  const loadReview = async (documentId: string) => {
    const res = await apiFetch<ReviewData>(`/api/documents/${documentId}/context-items`);
    if (res.ok && res.data) setData(res.data);
  };

  const onFileChosen = async (file: File) => {
    setError(null);
    setBusy(true);
    setStep(0);
    setData(null);

    const uploadUrl =
      selectedScope === "initiative_only" && props.initiativeId
        ? `/api/initiatives/${props.initiativeId}/documents`
        : `/api/projects/${props.projectId}/documents`;
    const form = new FormData();
    form.append("file", file);
    const uploadRes = await uploadFile<{ documentId: string }>(uploadUrl, form);
    if (!uploadRes.ok || !uploadRes.data) {
      setBusy(false);
      setError(uploadRes.error ?? "Could not upload that document.");
      return;
    }
    setStep(1);
    const { documentId } = uploadRes.data;

    setStep(2);
    const analyzeRes = await apiFetch(`/api/documents/${documentId}/analyze`, { method: "POST" });
    if (!analyzeRes.ok) {
      setBusy(false);
      setError(analyzeRes.error ?? "Could not analyze that document.");
      await loadReview(documentId);
      return;
    }

    await loadReview(documentId);
    setBusy(false);
    notify();
  };

  const retry = async () => {
    if (!data) return;
    setError(null);
    setBusy(true);
    const analyzeRes = await apiFetch(`/api/documents/${data.document.id}/analyze`, { method: "POST" });
    setBusy(false);
    if (!analyzeRes.ok) {
      setError(analyzeRes.error ?? "Could not analyze that document.");
      return;
    }
    await loadReview(data.document.id);
    notify();
  };

  const act = async (itemId: string, action: "approve" | "reject" | "resolve-conflict", body?: Record<string, unknown>) => {
    const res = await apiFetch(`/api/context-items/${itemId}/${action}`, { method: "POST", body: body ?? {} });
    if (!res.ok) {
      setError(res.error ?? "That action failed.");
      return;
    }
    setEditingId(null);
    if (data) await loadReview(data.document.id);
    notify();
  };

  const bulkAct = async (action: "approve" | "reject") => {
    const ids = [...selectedForBulk];
    setSelectedForBulk(new Set());
    // Sequential on purpose — each is a real write that should complete
    // before the next starts, not fired concurrently.
    for (const id of ids) {
      await apiFetch(`/api/context-items/${id}/${action}`, { method: "POST", body: {} });
    }
    if (data) await loadReview(data.document.id);
    notify();
  };

  // ---------- upload phase ----------
  if (!data) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        {!busy && (
          <>
            <h3 className="text-sm font-semibold text-text-primary">Import existing work</h3>
            <p className="mt-2 text-sm text-text-secondary">
              Upload an existing business case, requirements document, planning document, product
              presentation, project brief, product concept, or roadmap-related document. The
              platform will read it, identify useful planning details, show you what it found, flag
              anything missing or conflicting, and let you review everything before it becomes part
              of your {props.scope === "project_shared" ? "project" : "initiative"}.
            </p>
            <p className="mt-2 text-xs text-text-muted">
              Supported: {SUPPORTED_IMPORT_EXTENSIONS.map((e) => e.toUpperCase()).join(", ")} — up to{" "}
              {Math.round(MAX_IMPORT_FILE_BYTES / 1024 / 1024)}MB.
            </p>

            {props.allowScopeChoice && props.initiativeId && (
              <div className="mt-4 flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedScope("project_shared")}
                  className={`rounded-full border px-3 py-1.5 font-medium ${selectedScope === "project_shared" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-neutral-300 text-neutral-600"}`}
                >
                  Shared across the project
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedScope("initiative_only")}
                  className={`rounded-full border px-3 py-1.5 font-medium ${selectedScope === "initiative_only" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-neutral-300 text-neutral-600"}`}
                >
                  Specific to this initiative
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept={SUPPORTED_IMPORT_EXTENSIONS.map((e) => `.${e}`).join(",")}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFileChosen(file);
              }}
            />
            <div className="mt-4">
              <ButtonLoader onClick={() => fileInputRef.current?.click()} loading={false}>
                Choose a file to import
              </ButtonLoader>
            </div>
            {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
          </>
        )}
        {busy && <GenerationProgress title="Processing your document" steps={UPLOAD_STEPS} currentStep={step} />}
      </div>
    );
  }

  // ---------- failed phase ----------
  if (data.document.status === "failed") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <h3 className="text-sm font-semibold text-red-900">Document processing failed</h3>
        <p className="mt-1 text-sm text-red-800">
          {data.document.processingError ?? "Something went wrong while reading that document."} Your{" "}
          {props.scope === "project_shared" ? "project" : "initiative"} information was not changed.
        </p>
        <div className="mt-4 flex gap-2">
          <ButtonLoader onClick={() => void retry()} loading={busy} loadingLabel="Retrying">
            Retry
          </ButtonLoader>
          <button
            type="button"
            onClick={() => setData(null)}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-white"
          >
            Choose a different file
          </button>
        </div>
      </div>
    );
  }

  // ---------- review phase ----------
  const items = data.items;
  const conflicts = items.filter((i) => i.status === "conflict");
  const interpretations = items.filter((i) => i.status === "extracted" && i.kind === "interpretation");
  const found = items.filter((i) => i.status === "extracted" && i.kind === "explicit");
  const approved = items.filter((i) => i.status === "approved");
  const reviewableIds = new Set([...conflicts, ...interpretations, ...found].map((i) => i.id));

  const toggleBulk = (id: string) => {
    setSelectedForBulk((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const ItemRow = (item: ContextItemView) => {
    const isEditing = editingId === item.id;
    return (
      <li key={item.id} className="rounded-lg border border-neutral-200 bg-white p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {verbose && <span className="text-xs font-medium text-neutral-400">{fieldLabel(item.fieldKey)}</span>}
              {item.kind === "interpretation" && (
                <Badge variant="amber" title="AI's inference, not a direct quote from the document">
                  Potential interpretation
                </Badge>
              )}
            </div>
            {isEditing ? (
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
              />
            ) : (
              <p className="mt-1 text-sm text-text-primary">{displayValue(item.fieldKey, item.valueJson)}</p>
            )}
            {sourceLabel(item) && <p className="mt-1 text-xs text-neutral-400">Source: {sourceLabel(item)}</p>}
          </div>
          {!verbose && (
            <input
              type="checkbox"
              checked={selectedForBulk.has(item.id)}
              onChange={() => toggleBulk(item.id)}
              className="mt-1"
              aria-label="Select for bulk action"
            />
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {isEditing ? (
            <>
              <ButtonLoader
                variant="secondary"
                onClick={() => void act(item.id, "approve", { value: editValue })}
                loading={false}
              >
                Save & approve
              </ButtonLoader>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <ButtonLoader variant="secondary" onClick={() => void act(item.id, "approve")} loading={false}>
                {verbose ? "Check off — looks right" : "Approve"}
              </ButtonLoader>
              <button
                type="button"
                onClick={() => {
                  setEditingId(item.id);
                  setEditValue(displayValue(item.fieldKey, item.valueJson));
                }}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => void act(item.id, "reject")}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
              >
                Reject
              </button>
            </>
          )}
        </div>
      </li>
    );
  };

  const ConflictRow = (item: ContextItemView) => {
    const otherLabel = item.conflictWithItem
      ? displayValue(item.conflictWithItem.fieldKey, item.conflictWithItem.valueJson)
      : item.conflictsWithExistingValueText;
    return (
      <li key={item.id} className="rounded-lg border border-red-200 bg-red-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-700">{fieldLabel(item.fieldKey)}</p>
        <p className="mt-1 text-sm text-text-primary">
          {verbose
            ? `We found two different values for this. Which one should we use?`
            : "Conflicting values found."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <ButtonLoader
            variant="secondary"
            onClick={() => void act(item.id, "resolve-conflict", { chosenValue: displayValue(item.fieldKey, item.valueJson) })}
            loading={false}
          >
            Use &quot;{displayValue(item.fieldKey, item.valueJson)}&quot;
          </ButtonLoader>
          {otherLabel && (
            <ButtonLoader
              variant="secondary"
              onClick={() => void act(item.id, "resolve-conflict", { chosenValue: otherLabel })}
              loading={false}
            >
              Use &quot;{otherLabel}&quot;
            </ButtonLoader>
          )}
          <button
            type="button"
            onClick={() => {
              setEditingId(item.id);
              setEditValue(displayValue(item.fieldKey, item.valueJson));
            }}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-white"
          >
            Enter a different value
          </button>
        </div>
        {editingId === item.id && (
          <div className="mt-2 flex gap-2">
            <input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="flex-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
            />
            <ButtonLoader onClick={() => void act(item.id, "resolve-conflict", { chosenValue: editValue })} loading={false}>
              Use this
            </ButtonLoader>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-neutral-200 bg-white p-4">
        <div>
          <p className="text-sm font-semibold text-text-primary">{data.document.fileName}</p>
          <Badge variant={data.readiness === "context_ready" ? "emerald" : "amber"} className="mt-1">
            {data.readiness === "context_ready" ? "Context ready" : "Context needs review"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {!verbose && reviewableIds.size > 1 && selectedForBulk.size > 0 && (
            <>
              <ButtonLoader variant="secondary" onClick={() => void bulkAct("approve")} loading={false}>
                Approve selected
              </ButtonLoader>
              <ButtonLoader variant="secondary" onClick={() => void bulkAct("reject")} loading={false}>
                Reject selected
              </ButtonLoader>
            </>
          )}
          {props.continueHref && (
            <Link
              href={props.continueHref}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              {props.continueLabel ?? "Continue to Planning"}
            </Link>
          )}
        </div>
      </div>

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      {conflicts.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-red-700">Conflicts</h4>
          <ul className="mt-2 space-y-2">{conflicts.map(ConflictRow)}</ul>
        </section>
      )}

      {data.gaps.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700">Needs your input</h4>
          <ul className="mt-2 space-y-1">
            {data.gaps.map((gap) => (
              <li key={gap} className="text-sm text-text-secondary">
                ○ {fieldLabel(gap)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {found.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Found</h4>
          <ul className="mt-2 space-y-2">{found.map(ItemRow)}</ul>
        </section>
      )}

      {interpretations.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Potential interpretations</h4>
          <ul className="mt-2 space-y-2">{interpretations.map(ItemRow)}</ul>
        </section>
      )}

      {approved.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Approved</h4>
          <ul className="mt-2 space-y-1">
            {approved.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm text-text-secondary">
                <Badge variant={STATUS_VARIANT[item.status]}>✓</Badge>
                {fieldLabel(item.fieldKey)} — {item.approvedValueText}
              </li>
            ))}
          </ul>
        </section>
      )}

      {items.length === 0 && (
        <EmptyState
          title="Nothing usable was found in that document"
          description="Try a different document, or add this information manually."
        />
      )}
    </div>
  );
}
