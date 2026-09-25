"use client";

import { useState } from "react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { ButtonLoader } from "@/components/ui/loading";
import { apiFetch } from "@/lib/clientApi";

interface VersionEntry {
  versionNumber: number;
  status: string; // draft | approved | superseded
  approvedAt: string | null;
  createdAt: string;
  isCurrent: boolean;
}

interface DiffSummary {
  featuresAdded: string[];
  featuresRemoved: string[];
  phaseCountBefore: number;
  phaseCountAfter: number;
  totalPointsBefore: number;
  totalPointsAfter: number;
  estimatedCostBefore: number;
  estimatedCostAfter: number;
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  approved: "emerald",
  draft: "amber",
  superseded: "neutral",
};

const compareKey = (v: VersionEntry) => (v.isCurrent ? "current" : String(v.versionNumber));
const label = (v: VersionEntry) => `v${v.versionNumber}${v.isCurrent ? " (current)" : ""} — ${v.status}`;

/**
 * Roadmap versioning foundation — a lightweight panel, not a new NavTabs
 * tab/route: this is comparison/audit info over the same roadmap data, not a
 * primary work surface. Fetch-on-open, matching JiraSyncPanel's
 * data-arrives-via-props-then-mutates-via-fetch shape but self-contained
 * since version history isn't part of loadWorkspace()'s per-page payload.
 */
export default function RoadmapVersionPanel(props: { initiativeId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionEntry[] | null>(null);
  const [fromKey, setFromKey] = useState<string>("");
  const [toKey, setToKey] = useState<string>("");
  const [comparing, setComparing] = useState(false);
  const [diff, setDiff] = useState<DiffSummary | null>(null);

  const load = async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    setDiff(null);
    const res = await apiFetch<{ versions: VersionEntry[] }>(
      `/api/initiatives/${props.initiativeId}/roadmap-versions`,
    );
    setLoading(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not load version history.");
      return;
    }
    setVersions(res.data.versions);
    const current = res.data.versions.find((v) => v.isCurrent);
    const previous = res.data.versions.find((v) => !v.isCurrent);
    if (previous) setFromKey(compareKey(previous));
    if (current) setToKey(compareKey(current));
  };

  const compare = async () => {
    if (!fromKey || !toKey) return;
    setComparing(true);
    setError(null);
    const res = await apiFetch<{ diff: DiffSummary }>(
      `/api/initiatives/${props.initiativeId}/roadmap-versions/compare?from=${encodeURIComponent(fromKey)}&to=${encodeURIComponent(toKey)}`,
    );
    setComparing(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not compare versions.");
      return;
    }
    setDiff(res.data.diff);
  };

  return (
    <>
      <button
        onClick={() => void load()}
        className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
      >
        Version history
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold">Roadmap version history</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-sm text-neutral-400 hover:text-neutral-600"
              >
                Close
              </button>
            </div>

            {loading && <p className="mt-4 text-sm text-neutral-500">Loading…</p>}
            {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}

            {versions && versions.length > 0 && (
              <ul className="mt-4 space-y-2">
                {versions.map((v) => (
                  <li
                    key={compareKey(v)}
                    className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-neutral-800">
                      Roadmap v{v.versionNumber} {v.isCurrent && <span className="text-neutral-400">(current)</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant={STATUS_VARIANT[v.status] ?? "neutral"}>{v.status}</Badge>
                      <span className="text-xs text-neutral-400">
                        {new Date(v.approvedAt ?? v.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {versions && versions.length <= 1 && (
              <div className="mt-4">
                <EmptyState
                  title="Nothing to compare yet"
                  description="Approve this plan and regenerate at least once more to build version history."
                />
              </div>
            )}

            {versions && versions.length > 1 && (
              <div className="mt-5 border-t border-neutral-100 pt-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <select
                    value={fromKey}
                    onChange={(e) => setFromKey(e.target.value)}
                    className="rounded-lg border border-neutral-300 px-2 py-1.5"
                  >
                    {versions.map((v) => (
                      <option key={compareKey(v)} value={compareKey(v)}>
                        {label(v)}
                      </option>
                    ))}
                  </select>
                  <span className="text-neutral-400">vs.</span>
                  <select
                    value={toKey}
                    onChange={(e) => setToKey(e.target.value)}
                    className="rounded-lg border border-neutral-300 px-2 py-1.5"
                  >
                    {versions.map((v) => (
                      <option key={compareKey(v)} value={compareKey(v)}>
                        {label(v)}
                      </option>
                    ))}
                  </select>
                  <ButtonLoader onClick={() => void compare()} loading={comparing} loadingLabel="Comparing">
                    Compare
                  </ButtonLoader>
                </div>

                {diff && (
                  <dl className="mt-4 space-y-1.5 text-sm text-neutral-700">
                    <div className="flex justify-between">
                      <dt>Features added</dt>
                      <dd className="text-right">{diff.featuresAdded.join(", ") || "None"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Features removed</dt>
                      <dd className="text-right">{diff.featuresRemoved.join(", ") || "None"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Phases</dt>
                      <dd>
                        {diff.phaseCountBefore} → {diff.phaseCountAfter}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Story points</dt>
                      <dd>
                        {diff.totalPointsBefore} → {diff.totalPointsAfter}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Estimated cost (at current rate)</dt>
                      <dd>
                        ${Math.round(diff.estimatedCostBefore).toLocaleString()} → $
                        {Math.round(diff.estimatedCostAfter).toLocaleString()}
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
