"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import { ButtonLoader } from "@/components/ui/loading";

type Resource = { id: string; url: string; name: string; scopes: string[] };
type Connection = { id: string; initiativeId: string | null; status: string; cloudId: string | null; siteUrl: string | null; siteName: string | null; projectId: string | null; projectKey: string | null; projectName: string | null; accessibleResources: unknown; revision: number; tokenExpiresAt: string; lastImportedAt: string | null; createdAt: string; updatedAt: string };
type ImportRun = { id: string; connectionId: string; status: string; itemCount: number; createCount: number; updateCount: number; conflictCount: number; unchangedCount: number; appliedAt: string | null; createdAt: string; updatedAt: string };
type ImportItem = { id: string; externalKey: string; issueTypeName: string; targetType: string; summary: string; action: string; conflictReason: string | null; selected: boolean; status: string; createdAt: string; updatedAt: string };
type Project = { id: string; key: string; name: string; projectTypeKey: string };

const panel = "rounded-xl border border-border-subtle bg-white p-5 shadow-sm";
const input = "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";

function resources(value: unknown): Resource[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row))).map((row) => ({ id: String(row.id ?? ""), url: String(row.url ?? ""), name: String(row.name ?? ""), scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [] })).filter((row) => row.id);
}

export default function JiraIntegrationManager(props: { initiatives: { id: string; name: string }[]; connections: Connection[]; latestRun: ImportRun | null; latestItems: ImportItem[]; canManage: boolean }) {
  const router = useRouter(); const search = useSearchParams();
  const [initiativeId, setInitiativeId] = useState(props.initiatives[0]?.id ?? "");
  const [activeId, setActiveId] = useState(search.get("connectionId") ?? props.connections[0]?.id ?? "");
  const active = props.connections.find((row) => row.id === activeId) ?? props.connections[0] ?? null;
  const [projects, setProjects] = useState<Project[]>([]); const [projectId, setProjectId] = useState(active?.projectId ?? "");
  const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<string | null>(search.get("error")); const [message, setMessage] = useState<string | null>(search.get("connected") ? "Jira authorization succeeded. Finish selecting the site and project." : null);
  const [selected, setSelected] = useState(() => new Set(props.latestItems.filter((item) => item.selected && ["create","update"].includes(item.action)).map((item) => item.id))); const [reason, setReason] = useState("Import the reviewed Jira changes into the planning workspace.");
  const issueTypeMappings = useMemo(() => ({ Epic: "feature", Story: "story", Task: "story", Bug: "bug" }), []);

  const act = async <T,>(key: string, action: () => Promise<{ ok: boolean; data?: T; error?: string }>, success: string) => { setBusy(key); setError(null); setMessage(null); const result = await action(); setBusy(null); if (!result.ok) { setError(result.error ?? "The Jira action failed."); return result; } setMessage(success); router.refresh(); return result; };

  const connect = async () => { const result = await act<{ authorizationUrl: string }>("connect", () => apiFetch("/api/integrations/jira/oauth/start", { method: "POST", body: { initiativeId: initiativeId || null, returnPath: "/integrations/jira" } }), "Opening Atlassian authorization…"); if (result?.ok && result.data?.authorizationUrl) window.location.assign(result.data.authorizationUrl); };
  const chooseSite = async (cloudId: string) => { if (!active) return; await act("site", () => apiFetch(`/api/integrations/jira/connections/${active.id}/site`, { method: "PATCH", body: { cloudId, expectedRevision: active.revision } }), "Jira site selected."); };
  const loadProjects = async () => { if (!active) return; const result = await act<{ projects: Project[] }>("projects", () => apiFetch(`/api/integrations/jira/connections/${active.id}/projects`), "Jira projects loaded."); if (result?.ok) setProjects(result.data?.projects ?? []); };
  const configure = async () => { if (!active) return; const project = projects.find((row) => row.id === projectId); if (!project) { setError("Choose a Jira project."); return; } await act("configure", () => apiFetch(`/api/integrations/jira/connections/${active.id}/projects`, { method: "PATCH", body: { projectId: project.id, projectKey: project.key, projectName: project.name, expectedRevision: active.revision, issueTypeMappings, storyPointsField: "customfield_10016" } }), "Jira project mapping saved."); };
  const preview = async () => { if (!active) return; await act("preview", () => apiFetch("/api/integrations/jira/imports/preview", { method: "POST", body: { connectionId: active.id } }), "Import preview created. Review the selected items before applying."); };
  const apply = async () => { if (!props.latestRun) return; await act("apply", () => apiFetch(`/api/integrations/jira/imports/${props.latestRun!.id}`, { method: "PATCH", body: { expectedStatus: "previewed", selectedItemIds: [...selected], reason } }), "The approved Jira items were imported."); };

  return <div className="space-y-5">
    {!props.canManage && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Only organization owners and administrators can configure or import from Jira.</p>}
    {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <section className={panel}>
      <h2 className="font-semibold">1. Authorize Jira Cloud</h2><p className="mt-1 text-sm text-neutral-500">Atlassian OAuth grants read access. Guided Planning never asks for or stores an Atlassian password.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3"><label className="min-w-64 flex-1 text-sm font-medium">Planning initiative<select className={input} value={initiativeId} onChange={(event) => setInitiativeId(event.target.value)}><option value="">Organization-wide configuration</option>{props.initiatives.map((initiative) => <option key={initiative.id} value={initiative.id}>{initiative.name}</option>)}</select></label><ButtonLoader variant="primary" loading={busy === "connect"} loadingLabel="Starting OAuth" disabled={!props.canManage} onClick={connect}>Connect with Atlassian</ButtonLoader></div>
      {props.connections.length > 0 && <label className="mt-4 block text-sm font-medium">Connection<select className={input} value={active?.id ?? ""} onChange={(event) => setActiveId(event.target.value)}>{props.connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.siteName ?? "Jira connection"} — {connection.projectKey ?? connection.status}</option>)}</select></label>}
    </section>
    {active && <section className={panel}><h2 className="font-semibold">2. Select site and project</h2><p className="mt-1 text-sm text-neutral-500">Connection status: <strong>{active.status.replaceAll("_", " ")}</strong></p>
      {resources(active.accessibleResources).length > 1 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{resources(active.accessibleResources).map((resource) => <button key={resource.id} className={`rounded-lg border p-3 text-left text-sm ${active.cloudId === resource.id ? "border-indigo-500 bg-indigo-50" : "border-neutral-200"}`} disabled={!props.canManage || busy !== null} onClick={() => chooseSite(resource.id)}><strong>{resource.name}</strong><span className="block text-xs text-neutral-500">{resource.url}</span></button>)}</div>}
      {active.cloudId && <div className="mt-4 flex flex-wrap items-end gap-3"><ButtonLoader variant="secondary" loading={busy === "projects"} loadingLabel="Loading projects" disabled={!props.canManage} onClick={loadProjects}>Load available projects</ButtonLoader>{projects.length > 0 && <><label className="min-w-64 flex-1 text-sm font-medium">Jira project<select className={input} value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Choose a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.key} — {project.name}</option>)}</select></label><ButtonLoader variant="primary" loading={busy === "configure"} loadingLabel="Saving mapping" onClick={configure}>Save project mapping</ButtonLoader></>}</div>}
    </section>}
    {active?.status === "connected" && <section className={panel}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">3. Preview and approve imports</h2><p className="mt-1 text-sm text-neutral-500">Jira work is read into a preview. Conflicts are never resolved automatically.</p></div><ButtonLoader variant="primary" loading={busy === "preview"} loadingLabel="Reading Jira" disabled={!props.canManage} onClick={preview}>Create import preview</ButtonLoader></div>
      {props.latestRun && <div className="mt-4"><p className="text-sm">Preview: {props.latestRun.createCount} create · {props.latestRun.updateCount} update · {props.latestRun.unchangedCount} unchanged · <span className={props.latestRun.conflictCount ? "text-red-700" : ""}>{props.latestRun.conflictCount} conflicts</span></p><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-neutral-500"><th className="p-2">Import</th><th className="p-2">Jira</th><th className="p-2">Type</th><th className="p-2">Planning target</th><th className="p-2">Action</th><th className="p-2">Summary</th></tr></thead><tbody>{props.latestItems.map((item) => <tr key={item.id} className="border-b align-top"><td className="p-2"><input aria-label={`Import ${item.externalKey}`} type="checkbox" checked={selected.has(item.id)} disabled={!props.canManage || !["create","update"].includes(item.action) || props.latestRun?.status !== "previewed"} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} /></td><td className="p-2 font-medium">{item.externalKey}</td><td className="p-2">{item.issueTypeName}</td><td className="p-2">{item.targetType}</td><td className="p-2">{item.action}{item.conflictReason && <span className="block text-xs text-red-700">{item.conflictReason}</span>}</td><td className="p-2">{item.summary}</td></tr>)}</tbody></table></div>{props.latestRun.status === "previewed" && <div className="mt-4 flex flex-wrap items-end gap-3"><label className="min-w-72 flex-1 text-sm font-medium">Approval reason<input className={input} value={reason} onChange={(event) => setReason(event.target.value)} /></label><ButtonLoader variant="primary" loading={busy === "apply"} loadingLabel="Applying import" disabled={!props.canManage || selected.size === 0 || reason.trim().length < 5} onClick={apply}>Import {selected.size} approved items</ButtonLoader></div>}</div>}
    </section>}
    <p className="text-xs text-neutral-500">Import support includes Jira epics, stories/tasks, and bugs. Status, assignee, estimate, sprint, release, labels, source timestamps, and the original Jira snapshot remain attached to the import evidence.</p>
  </div>;
}
