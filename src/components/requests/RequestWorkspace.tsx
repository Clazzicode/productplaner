"use client";
import { useState } from "react";
import { emptyRequest, priorityScore, requestSchema, toRequestInput, type RequestInput, type RequestRecord } from "@/lib/requests/model";
import AiAssistItemCard, { type AiAssistItemDTO } from "@/components/ai/AiAssistItemCard";
import RequestEditor, { type RequestTab } from "./RequestEditor";

const tabs: { id: RequestTab; label: string; description: string }[] = [
  { id: "intake", label: "Capture request", description: "Record a new request with key details." },
  { id: "requirements", label: "Clarify requirements", description: "Refine the request and confirm what’s needed." },
  { id: "priority", label: "Prioritize", description: "Assess value, effort, and timing to set priority." },
];

function WorkflowIcon({ tab }: { tab: RequestTab }) {
  const paths: Record<RequestTab, React.ReactNode> = {
    intake: <><path d="M4 3h9l5 5v13H4z" /><path d="M13 3v5h5" /><circle cx="18" cy="18" r="5" fill="white" /><path d="M18 15v6m-3-3h6" /></>,
    requirements: <><path d="M4 5h16v12H9l-5 4V5Z" /><path d="M8 9h8m-8 4h5" /></>,
    priority: <><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" /></>,
  };
  return <svg aria-hidden="true" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[tab]}</svg>;
}
interface SpreadsheetPreviewRow { rowNumber: number; sheetName: string; raw: Record<string, string>; request: RequestInput; warnings: string[] }
interface RequestRevisionDTO { id: string; fromRevision: number; toRevision: number; reason: string; changedBy: string; changedFields: string[]; sourceAiAssistItemId: string | null; createdAt: string }
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
  const [reviewItems, setReviewItems] = useState<AiAssistItemDTO[]>([]);
  const [history, setHistory] = useState<RequestRevisionDTO[]>([]);
  async function loadRequirementData(requestId: string) {
    if (demo) return;
    const [reviewResponse, historyResponse] = await Promise.all([
      fetch(`/api/initiatives/${initiativeId}/requests/${requestId}/review`),
      fetch(`/api/initiatives/${initiativeId}/requests/${requestId}/history`),
    ]);
    const [reviewBody, historyBody] = await Promise.all([reviewResponse.json(), historyResponse.json()]);
    if (!reviewResponse.ok) throw new Error(reviewBody.error ?? "Unable to load the requirement review.");
    if (!historyResponse.ok) throw new Error(historyBody.error ?? "Unable to load requirement history.");
    setReviewItems(reviewBody.items);
    setHistory(historyBody.revisions);
  }
  const open = (row: RequestRecord | null) => {
    setSelected(row); setDraft(row ? toRequestInput(row) : emptyRequest()); setDirty(false); setError(""); setMessage("");
    setReviewItems([]); setHistory([]);
    if (row && !demo) void loadRequirementData(row.id).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load requirement details."));
  };
  async function refreshSelected(requestId: string) {
    const response = await fetch(`/api/initiatives/${initiativeId}/requests`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to refresh requests.");
    const nextRequests = body.requests as RequestRecord[];
    setRequests(nextRequests);
    const nextSelected = nextRequests.find((row) => row.id === requestId) ?? null;
    setSelected(nextSelected);
    if (nextSelected) setDraft(toRequestInput(nextSelected));
    setDirty(false);
    await loadRequirementData(requestId);
  }
  async function reviewRequirements() {
    if (!selected || demo || dirty) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/initiatives/${initiativeId}/requests/${selected.id}/review`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to review requirements.");
      await loadRequirementData(selected.id);
      setMessage(body.decision === "reuse" ? "The current requirement review is still valid." : body.decision === "flag_stale" ? "The previous review is out of date. Dismiss it before generating a replacement." : "ChatGPT review complete. Apply, edit, or dismiss each suggestion individually.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to review requirements."); }
    finally { setBusy(false); }
  }
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
  return <div className="space-y-5 text-slate-900">
    {demo && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Local PO demo · sample data.</strong> Changes last until you reload this page. This demo does not save to your database or call AI/Jira. The signed-in workspace uses the real saved workflow.</div>}
    <nav aria-label="Request workflow" className="relative grid gap-3 md:grid-cols-3 md:gap-6">
      <span aria-hidden="true" className="pointer-events-none absolute left-[10%] right-[10%] top-1/2 hidden h-0.5 -translate-y-1/2 bg-[#d9d4ff] md:block" />
      {tabs.map(item => <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}
        className={`relative flex min-h-20 items-center gap-4 rounded-xl border px-5 py-4 text-left shadow-[0_2px_8px_rgba(25,35,75,0.03)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${tab === item.id ? "border-[#5145f5] bg-[#eeecff] text-[#5145f5] ring-1 ring-[#5145f5]" : "border-[#dce2f0] bg-white text-[#71809d] hover:border-[#a8a0ff] hover:bg-[#fbfaff]"}`}>
        <span className="grid h-11 w-11 flex-none place-items-center"><WorkflowIcon tab={item.id} /></span>
        <span className="min-w-0"><span className="block text-sm font-semibold text-[#142044]">{item.label}</span><span className="mt-1 block text-xs leading-4 text-[#586887]">{item.description}</span></span>
      </button>)}
    </nav>
    {spreadsheet && <section className="rounded-2xl border border-[#dce2f0] bg-white p-5" aria-label="Spreadsheet import preview">
      <h2 className="text-base font-semibold">Preview spreadsheet requests</h2>
      <p className="mt-1 text-sm text-slate-500">Review the rows before import. The original file and imported rows remain as source evidence.</p>
      <div className="mt-4 space-y-3"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Import</th><th className="p-2">Row</th><th className="p-2">Title</th><th className="p-2">Type</th><th className="p-2">Review</th></tr></thead><tbody>{spreadsheet.rows.map((row, index) => {
        const valid = requestSchema.safeParse(row.request).success;
        return <tr key={`${row.sheetName}-${row.rowNumber}`} className="border-b align-top"><td className="p-2"><input type="checkbox" disabled={!valid} checked={selectedRows.has(index)} onChange={() => setSelectedRows((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })} aria-label={`Import row ${row.rowNumber}`} /></td><td className="p-2">{row.sheetName} · {row.rowNumber}</td><td className="p-2 font-medium">{row.request.title || "Missing title"}</td><td className="p-2 capitalize">{row.request.kind.replaceAll("_", " ")}</td><td className={`p-2 ${valid ? "text-amber-700" : "text-red-700"}`}>{valid ? row.warnings.join(", ") || "Ready" : "Fix required fields in the spreadsheet and upload again"}</td></tr>;
      })}</tbody></table></div><div className="flex gap-3"><button type="button" disabled={busy || selectedRows.size === 0} onClick={() => void importSpreadsheet()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Importing…" : `Import ${selectedRows.size} selected`}</button><button type="button" onClick={() => { setSpreadsheet(null); setSelectedRows(new Set()); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button></div></div>
    </section>}
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(260px,310px)_minmax(0,1fr)]">
      <aside className="min-h-[500px] space-y-4 rounded-2xl border border-[#dce2f0] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[#111b36]">Requests</h2>
          {!demo && canEdit && <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#d9d6ff] bg-white px-2.5 py-1.5 text-xs font-medium text-[#5145ed] hover:bg-[#f5f3ff]">
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 11V2m-3 3 3-3 3 3M3 11v3h10v-3" /></svg>
            Import spreadsheet
            <input type="file" accept=".csv,.xlsx,.ods" className="sr-only" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void previewSpreadsheet(file); event.currentTarget.value = ""; }} />
          </label>}
        </div>
        <label className="block"><span className="sr-only">Search requests</span><input className="block w-full rounded-lg border border-[#d0d8e9] bg-[#f8faff] px-3 py-2 text-sm" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search requests..." /></label>
        <label className="block"><span className="sr-only">Priority decision</span><select className="block w-full rounded-lg border border-[#d0d8e9] bg-white px-3 py-2 text-sm" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All decisions</option><option value="untriaged">Not decided</option><option value="now">Now</option><option value="next">Next</option><option value="later">Later</option></select></label>
        {visible.length > 0 && <div className="flex items-center justify-between gap-2"><p className="text-xs text-slate-500">{visible.length} request{visible.length === 1 ? "" : "s"} · score order</p>{canEdit && <button type="button" className="text-xs font-semibold text-[#5145ed] disabled:opacity-40" disabled={busy || dirty} onClick={() => { open(null); setTab("intake"); }}>+ New request</button>}</div>}
        <div className="space-y-2">{visible.map(row => <button key={row.id} disabled={busy || dirty} onClick={() => open(row)} className={`block w-full rounded-xl border p-3 text-left disabled:opacity-60 ${selected?.id === row.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
          <span className="block font-semibold">{row.title}</span><span className="mt-1 block text-xs capitalize text-slate-500">{row.kind.replaceAll("_", " ")} · {row.source} · {row.status}</span>
          <span className="mt-2 flex justify-between text-sm"><span className="capitalize text-indigo-700">{row.priority.decision === "untriaged" ? "Not decided" : row.priority.decision}</span><strong>{priorityScore(row.priority)} / 100</strong></span>
        </button>)}{visible.length === 0 && <div className="flex min-h-[260px] flex-col items-center justify-center px-3 text-center">
          <span aria-hidden="true" className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-[#f0eeff] text-[#776dff]"><svg width="37" height="37" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 11h18M11 20h18M11 29h13" /><circle cx="7" cy="11" r="1" fill="currentColor" /><circle cx="7" cy="20" r="1" fill="currentColor" /><circle cx="7" cy="29" r="1" fill="currentColor" /></svg></span>
          <p className="text-sm font-semibold text-[#111b36]">{requests.length === 0 ? "No requests yet" : "No matching requests"}</p>
          <p className="mt-1 text-xs text-[#67758f]">{requests.length === 0 ? "Capture a request to get started." : "Try a different search or decision filter."}</p>
          {canEdit && requests.length === 0 && <button type="button" disabled={busy || dirty} onClick={() => { open(null); setTab("intake"); }} className="mt-5 rounded-lg bg-[#5145ed] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#4238d7] disabled:opacity-40">+ New request</button>}
        </div>}</div>
      </aside>
      <section className="min-w-0 rounded-2xl border border-[#dce2f0] bg-white p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            {selected && <p className="mb-1 max-w-2xl truncate text-xs font-medium text-[#5e6e8a]">{selected.title}</p>}
            <h2 className="text-xl font-semibold text-[#111b36]">{tabs.find(item => item.id === tab)?.label}</h2>
            <p className="mt-1 text-sm text-[#66758e]">{tab === "intake" ? "Record the request with the essential details. You can clarify requirements and set priority next." : tab === "requirements" ? "Resolve open questions and confirm what is needed before the Product Owner decides." : "Compare value, effort, and timing, then record the Product Owner’s decision."}</p>
          </div>
          <span className="text-xs text-[#687793]">{dirty ? "Unsaved changes" : selected ? `Saved revision ${selected.revision}` : "New request"}</span>
        </div>
        <form onSubmit={e => { e.preventDefault(); void submit(); }}>
          <fieldset disabled={!canEdit || busy} className="space-y-5 disabled:opacity-70">
            <RequestEditor value={draft} tab={tab} onChange={value => { setDraft(value); setDirty(true); setMessage(""); }} />
            <label className="block border-t border-[#e6e9f2] pt-5 text-sm font-medium">Request status<select value={draft.status} onChange={e => { setDraft({ ...draft, status: e.target.value as RequestInput["status"] }); setDirty(true); }} className="ml-3 rounded-lg border border-[#d0d8e9] bg-white p-2"><option value="new">New</option><option value="clarifying">Needs clarification</option><option value="ready">Requirements ready</option><option value="approved">PO approved</option><option value="declined">Declined</option></select></label>
            <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
              {selected?.status === "approved" && !selected.capabilityId && <button type="button" disabled={dirty} onClick={() => void submit(true)} className="mr-auto rounded-lg border border-indigo-300 px-4 py-2 text-sm text-indigo-700 disabled:opacity-40">Create planning feature</button>}
              <button type="button" onClick={() => open(selected)} className="rounded-lg px-3 py-2 text-sm text-[#5f6f8a] hover:bg-[#f4f5fb]">{selected ? "Discard edits" : "Clear"}</button>
              <button type="submit" className="rounded-lg bg-[#5145ed] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#4238d7]">{busy ? "Saving…" : !selected && tab === "intake" ? "Capture request" : "Save request"}</button>
            </div>
          </fieldset>
        </form>
        {tab === "requirements" && selected && !demo && <div className="mt-6 space-y-5 border-t border-slate-200 pt-6">
          <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-950">ChatGPT requirements review</h3><p className="mt-1 text-sm text-slate-600">Find focused follow-up questions, contradictions, missing business rules, risks, dependencies, and likely engineering questions. Nothing changes until you apply an individual suggestion.</p></div>
              {canEdit && <button type="button" disabled={busy || dirty} onClick={() => void reviewRequirements()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Reviewing…" : "Review with ChatGPT"}</button>}</div>
            {dirty && <p className="mt-2 text-xs text-amber-700">Save or discard your edits before requesting a review.</p>}
          </section>
          {reviewItems.length > 0 && <section className="space-y-3"><h3 className="font-semibold">Review suggestions</h3>{reviewItems.map((item) => <AiAssistItemCard key={item.id} item={item} onChanged={() => { void refreshSelected(selected.id).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to refresh the request.")); }} />)}</section>}
          <section className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold">Requirement history</h3><p className="mt-1 text-sm text-slate-500">Every saved version and applied ChatGPT suggestion is retained.</p>
            <div className="mt-3 space-y-3">{history.map((revision) => <div key={revision.id} className="rounded-lg bg-slate-50 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>Revision {revision.toRevision}</strong><span className="text-slate-500">{new Date(revision.createdAt).toLocaleString()}</span></div><p className="mt-1">{revision.reason}</p><p className="mt-1 text-xs text-slate-500">By {revision.changedBy}{revision.sourceAiAssistItemId ? " · Approved ChatGPT suggestion" : ""}</p>{revision.changedFields.length > 0 && <p className="mt-1 text-xs text-slate-600">Changed: {revision.changedFields.map((field) => field.replaceAll(/([A-Z])/g, " $1").toLowerCase()).join(", ")}</p>}</div>)}{history.length === 0 && <p className="text-sm text-slate-500">No saved requirement versions yet.</p>}</div>
          </section>
        </div>}
        {!canEdit && <p className="mt-4 text-sm text-slate-500">You have view-only access to this initiative.</p>}
        {selected?.capabilityId && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Linked to a planning feature. Further request edits do not automatically change that feature.</p>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
      </section>
    </div>
  </div>;
}
