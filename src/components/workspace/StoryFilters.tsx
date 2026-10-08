"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Option = { id: string; label: string };

export default function StoryFilters(props: { features: Option[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(current.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return <div className="mt-5 grid gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 md:grid-cols-4">
    <label className="text-xs font-medium text-neutral-600">Feature
      <select value={current.get("feature") ?? ""} onChange={(event) => update("feature", event.target.value)} className="mt-1 w-full rounded-lg border bg-white px-2 py-2 text-sm">
        <option value="">All features</option>
        {props.features.map((feature) => <option key={feature.id} value={feature.id}>{feature.label}</option>)}
      </select>
    </label>
    <label className="text-xs font-medium text-neutral-600">Source
      <select value={current.get("source") ?? ""} onChange={(event) => update("source", event.target.value)} className="mt-1 w-full rounded-lg border bg-white px-2 py-2 text-sm">
        <option value="">All sources</option>
        <option value="manual">Manual</option>
        <option value="ai">AI assisted</option>
        <option value="split">Split</option>
        <option value="generated">Generated</option>
        <option value="jira">Jira history</option>
      </select>
    </label>
    <label className="text-xs font-medium text-neutral-600">Readiness
      <select value={current.get("readiness") ?? ""} onChange={(event) => update("readiness", event.target.value)} className="mt-1 w-full rounded-lg border bg-white px-2 py-2 text-sm">
        <option value="">All readiness states</option>
        <option value="needs_refinement">Needs refinement</option>
        <option value="ready_for_refinement">Ready for refinement</option>
        <option value="sprint_ready">Sprint ready</option>
        <option value="blocked">Blocked</option>
        <option value="split">Split</option>
      </select>
    </label>
    <label className="text-xs font-medium text-neutral-600">Archive
      <select value={current.get("archive") ?? "active"} onChange={(event) => update("archive", event.target.value)} className="mt-1 w-full rounded-lg border bg-white px-2 py-2 text-sm">
        <option value="active">Active stories</option>
        <option value="archived">Archived stories</option>
        <option value="all">All stories</option>
      </select>
    </label>
  </div>;
}
