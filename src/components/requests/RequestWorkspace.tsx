"use client";
import { useState } from "react";
import { emptyRequest, priorityScore, requestSchema, toRequestInput, type RequestInput, type RequestRecord } from "@/lib/requests/model";
import RequestEditor, { type RequestTab } from "./RequestEditor";

const tabs: { id: RequestTab; label: string }[] = [{ id: "intake", label: "1 · Capture request" }, { id: "requirements", label: "2 · Clarify requirements" }, { id: "priority", label: "6 · Prioritize" }];
interface SpreadsheetPreviewRow { rowNumber: number; sheetName: string; raw: Record<string, string>; request: RequestInput; warnings: string[] }
export default function RequestWorkspace({ initiativeId, initialRequests, canEdit, demo = false }: {
  initiativeId: string; initialRequests: RequestRecord[]; canEdit: boolean; demo?: boolean;
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [selected, setSelected] = useState<RequestRecord | null>(null);
  const [draft, setDraft] = useState<RequestInput>(emptyRequest);
  const [tab, setTab] = useState<RequestTab>("intake");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [spreadsheet, setSpreadsheet] = useState<{ documentId: string; rows: SpreadsheetPreviewRow[] } | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const open = (row: RequestRecord | null) => {
    setSelected(row); setDraft(row ? toRequestInput(row) : emptyRequest()); setDirty(false); setError(""); setMessage("");
  };
  async function submit(promote = false) {
    setError(""); setMessage("");
    const parsed = requestSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues.map(i => i.message).join(" ")); return; }
    setBusy(true);
    try {
      let row: RequestRecord;
      if (demo) {
        if (promote && draft.status !== "approved") throw new Error("Approve the request first.");
        if (!promote && selected?.status === "approved" && draft.status === "approved" && JSON.stringify(toRequestInput(selected)) !== JSON.stringify(draft)) throw new Error("Reopen this request for clarification before editing an approved decision.");
        row = { ...parsed.data, id: selected?.id ?? crypto.randomUUID(), revision: (selected?.revision ?? 0) + 1,
          capabilityId: promote ? "demo-feature" : selected?.capabilityId ?? null, updatedAt: new Date().toISOString() };
      } else {
        const response = await fetch(`/api/initiatives/${initiativeId}/requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(promote
          ? { action: "promote", id: selected!.id, revision: selected!.revision }
          : { action: "save", data: parsed.data, ...(selected ? { existing: { id: selected.id, revision: selected.revision } } : {}) }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to save request.");
        row = body.request;
      }
      setRequests(items => [row, ...items.filter(item => item.id !== row.id)]); open(row);
      setMessage(promote ? demo ? "Feature handoff simulated for this demo. The signed-in workflow creates a real linked planning feature." : "Planning feature created. Review its MVP scope and dependencies in guided intake, then regenerate the plan when ready." : demo ? "Saved for this demo session. No customer data or live services were changed." : "Request saved. Your decision is recorded in the audit trail.");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save."); }
    finally { setBusy(false); }
  }
  async function previewSpreadsheet(file: File) {
    setBusy(true); setError(""); setMessage("");
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch(`/api/initiatives/${initiativeId}/requests/spreadsheet`, { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to read that spreadsheet.");
      const rows = body.rows as SpreadsheetPreviewRow[];
      setSpreadsheet({ documentId: body.documentId, rows });
      setSelectedRows(new Set(rows.map((row, index) => requestSchema.safeParse(row.request).success ? index : -1).filter((index) => index >= 0)));
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to read that spreadsheet."); }
    finally { setBusy(false); }
  }
  async function importSpreadsheet() {
    if (!spreadsheet || selectedRows.size === 0) return;
    setBusy(true); setError("");
    try {
      const rows = spreadsheet.rows.filter((_, index) => selectedRows.has(index));
      const response = await fetch(`/api/initiatives/${initiativeId}/requests/spreadsheet`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import", documentId: spreadsheet.documentId, rows }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to import those rows.");
      setRequests((items) => [...body.requests, ...items]); setSpreadsheet(null); setSelectedRows(new Set());
      setMessage(`${body.requests.length} spreadsheet request${body.requests.length === 1 ? "" : "s"} imported with source traceability.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to import those rows."); }
    finally { setBusy(false); }
  }
  const visible = requests.filter(r => `${r.title} ${r.requestor} ${r.kind} ${r.source} ${r.sourceReference}`.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || r.priority.decision === filter))
    .sort((a, b) => priorityScore(b.priority) - priorityScore(a.priority) || a.title.localeCompare(b.title));
  return <div className="space-y-6 text-slate-900">
    {demo && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Local PO demo · sample data.</strong> Changes last until you reload this page. This demo does not save to your database or call AI/Jira. The signed-in workspace uses the real saved workflow.</div>}
    <div className="grid gap-3 sm:grid-cols-3">{[
      ["Requests captured", requests.length], ["Open questions", requests.reduce((n, r) => n + r.questions.filter(q => !q.answer.trim()).length, 0)], ["PO decisions recorded", requests.filter(r => r.priority.decision !== "untriaged").length],
    ].map(([label, count]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{count}</p></div>)}</div>
    {!demo && canEdit && <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Import request spreadsheet</h2><p className="text-sm text-slate-500">Preview CSV, XLSX, or ODS rows before creating requests. The original file and each imported row are retained as source evidence.</p></div>
        <label className="cursor-pointer rounded-lg border border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-700">Choose spreadsheet<input type="file" accept=".csv,.xlsx,.ods" className="sr-only" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void previewSpreadsheet(file); event.currentTarget.value = ""; }} /></label></div>
      {spreadsheet && <div className="mt-4 space-y-3"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Import</th><th className="p-2">Row</th><th className="p-2">Title</th><th className="p-2">Type</th><th className="p-2">Review</th></tr></thead><tbody>{spreadsheet.rows.map((row, index) => {
        const valid = requestSchema.safeParse(row.request).success;
        return <tr key={`${row.sheetName}-${row.rowNumber}`} className="border-b align-top"><td className="p-2"><input type="checkbox" disabled={!valid} checked={selectedRows.has(index)} onChange={() => setSelectedRows((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })} aria-label={`Import row ${row.rowNumber}`} /></td><td className="p-2">{row.sheetName} · {row.rowNumber}</td><td className="p-2 font-medium">{row.request.title || "Missing title"}</td><td className="p-2 capitalize">{row.request.kind.replaceAll("_", " ")}</td><td className={`p-2 ${valid ? "text-amber-700" : "text-red-700"}`}>{valid ? row.warnings.join(", ") || "Ready" : "Fix required fields in the spreadsheet and upload again"}</td></tr>;
      })}</tbody></table></div><div className="flex gap-3"><button type="button" disabled={busy || selectedRows.size === 0} onClick={() => void importSpreadsheet()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Importing…" : `Import ${selectedRows.size} selected`}</button><button type="button" onClick={() => { setSpreadsheet(null); setSelectedRows(new Set()); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button></div></div>}
    </section>}
    <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Request backlog</h2><button className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-40" disabled={!canEdit || busy || dirty} onClick={() => { open(null); setTab("intake"); }}>New request</button></div>
        <label className="block text-sm">Search requests<input className="mt-1 block w-full rounded-lg border border-slate-300 p-2" value={search} onChange={e => setSearch(e.target.value)} placeholder="Title, requestor, type, or source" /></label>
        <label className="block text-sm">Priority decision<select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All decisions</option><option value="untriaged">Not decided</option><option value="now">Now</option><option value="next">Next</option><option value="later">Later</option></select></label>
        <p className="text-xs text-slate-500">Ordered by calculated score. The recorded PO decision can override the ranking.</p>
        <div className="space-y-2">{visible.map(row => <button key={row.id} disabled={busy || dirty} onClick={() => open(row)} className={`block w-full rounded-xl border p-3 text-left disabled:opacity-60 ${selected?.id === row.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
          <span className="block font-semibold">{row.title}</span><span className="mt-1 block text-xs capitalize text-slate-500">{row.kind.replaceAll("_", " ")} · {row.source} · {row.status}</span>
          <span className="mt-2 flex justify-between text-sm"><span className="capitalize text-indigo-700">{row.priority.decision === "untriaged" ? "Not decided" : row.priority.decision}</span><strong>{priorityScore(row.priority)} / 100</strong></span>
        </button>)}{visible.length === 0 && <p className="py-4 text-sm text-slate-500">No requests match. Capture a request to get started.</p>}</div>
      </aside>
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{selected ? selected.title : "Capture a new request"}</h2><span className="text-xs text-slate-500">{dirty ? "Unsaved changes" : selected ? `Saved revision ${selected.revision}` : "New request"}</span></div>
        <nav aria-label="Request workflow" className="mb-6 flex flex-wrap gap-2">{tabs.map(t => <button key={t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)} className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === t.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"}`}>{t.label}</button>)}</nav>
        <form onSubmit={e => { e.preventDefault(); void submit(); }}>
          <fieldset disabled={!canEdit || busy} className="space-y-5 disabled:opacity-70">
            <RequestEditor value={draft} tab={tab} onChange={value => { setDraft(value); setDirty(true); setMessage(""); }} />
            <label className="block border-t border-slate-200 pt-5 text-sm font-medium">Request status<select value={draft.status} onChange={e => { setDraft({ ...draft, status: e.target.value as RequestInput["status"] }); setDirty(true); }} className="ml-3 rounded-lg border border-slate-300 bg-white p-2"><option value="new">New</option><option value="clarifying">Needs clarification</option><option value="ready">Requirements ready</option><option value="approved">PO approved</option><option value="declined">Declined</option></select></label>
            <div className="flex flex-wrap gap-3"><button type="submit" className="rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white">{busy ? "Saving…" : "Save request"}</button>
              {dirty && <button type="button" onClick={() => open(selected)} className="rounded-lg border border-slate-300 px-4 py-2">Discard edits</button>}
              {selected?.status === "approved" && !selected.capabilityId && <button type="button" disabled={dirty} onClick={() => void submit(true)} className="rounded-lg border border-indigo-300 px-4 py-2 text-indigo-700 disabled:opacity-40">Create planning feature</button>}
            </div>
          </fieldset>
        </form>
        {!canEdit && <p className="mt-4 text-sm text-slate-500">You have view-only access to this initiative.</p>}
        {selected?.capabilityId && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Linked to a planning feature. Further request edits do not automatically change that feature.</p>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
      </section>
    </div>
  </div>;
}
