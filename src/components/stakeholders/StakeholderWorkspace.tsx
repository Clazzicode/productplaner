"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Input from "@/components/ui/Input";
import { apiFetch } from "@/lib/clientApi";
import { productRoles } from "@/lib/stakeholders/model";

type InitiativeOption = { id: string; name: string; projectName: string };
type MemberOption = { id: string; name: string; email: string };
type Contact = { id: string; displayName: string; email: string | null; company: string | null; external: boolean };
type Assignment = {
  id: string; stakeholderId: string; productRole: string; responsibility: string;
  influence: string; interest: string; engagementExpectation: string; revision: number;
  stakeholder: Contact;
};
type TargetType = "request" | "feature" | "story" | "sprint" | "release" | "decision";
type WorkspaceData = {
  contacts: Contact[];
  assignments: Assignment[];
  targets: Record<TargetType, { id: string; label: string }[]>;
};

const roleLabel = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function StakeholderWorkspace(props: { initiatives: InitiativeOption[]; members: MemberOption[]; canEdit: boolean }) {
  const [initiativeId, setInitiativeId] = useState(props.initiatives[0]?.id ?? "");
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [contactMode, setContactMode] = useState<"external" | "member">("external");
  const [memberId, setMemberId] = useState(props.members[0]?.id ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [stakeholderId, setStakeholderId] = useState("");
  const [productRole, setProductRole] = useState<(typeof productRoles)[number]>("stakeholder");
  const [targetType, setTargetType] = useState<TargetType>("feature");
  const [targetId, setTargetId] = useState("");
  const [responsibility, setResponsibility] = useState("");

  const load = useCallback(async () => {
    if (!initiativeId) return;
    const result = await apiFetch<WorkspaceData>(`/api/initiatives/${initiativeId}/stakeholders`);
    if (!result.ok || !result.data) return setError(result.error ?? "Couldn't load stakeholders.");
    setData(result.data);
  }, [initiativeId]);

  useEffect(() => {
    let active = true;
    if (!initiativeId) return;
    void apiFetch<WorkspaceData>(`/api/initiatives/${initiativeId}/stakeholders`).then((result) => {
      if (!active) return;
      if (!result.ok || !result.data) setError(result.error ?? "Couldn't load stakeholders.");
      else setData(result.data);
    });
    return () => { active = false; };
  }, [initiativeId]);

  const targetChoices = data?.targets[targetType] ?? [];
  const selectedTargetId = targetChoices.some((choice) => choice.id === targetId) ? targetId : targetChoices[0]?.id ?? "";
  const selectedStakeholderId = data?.contacts.some((contact) => contact.id === stakeholderId) ? stakeholderId : data?.contacts[0]?.id ?? "";

  const selectedMember = useMemo(() => props.members.find((member) => member.id === memberId), [memberId, props.members]);

  async function addContact() {
    if (!initiativeId) return;
    setPending(true); setError(null);
    const payload = contactMode === "member"
      ? { userId: memberId, displayName: selectedMember?.name ?? "Member", email: selectedMember?.email ?? "", company: "", external: false }
      : { displayName: name, email, company, external: true };
    const result = await apiFetch(`/api/initiatives/${initiativeId}/stakeholders`, { method: "POST", body: { action: "create_contact", data: payload } });
    setPending(false);
    if (!result.ok) return setError(result.error ?? "Couldn't add stakeholder.");
    setName(""); setEmail(""); setCompany(""); await load();
  }

  async function addAssignment() {
    if (!initiativeId || !selectedStakeholderId || !selectedTargetId) return;
    setPending(true); setError(null);
    const result = await apiFetch(`/api/initiatives/${initiativeId}/stakeholders`, { method: "POST", body: {
      action: "create_assignment",
      data: { stakeholderId: selectedStakeholderId, initiativeId, productRole, responsibility, influence: "medium", interest: "medium", engagementExpectation: "", target: { type: targetType, id: selectedTargetId } },
    } });
    setPending(false);
    if (!result.ok) return setError(result.error ?? "Couldn't assign stakeholder.");
    setResponsibility(""); await load();
  }

  async function archiveAssignment(assignment: Assignment) {
    setPending(true); setError(null);
    const result = await apiFetch(`/api/stakeholder-assignments/${assignment.id}`, { method: "PATCH", body: {
      expectedRevision: assignment.revision, archived: true, reason: "Assignment removed from active planning work",
    } });
    setPending(false);
    if (!result.ok) return setError(result.error ?? "Couldn't archive assignment.");
    await load();
  }

  if (props.initiatives.length === 0) return <EmptyState title="No accessible initiatives" description="Create or gain access to an initiative before assigning product stakeholders." />;

  return <section className="mt-8 space-y-5 rounded-2xl border border-border-subtle bg-white p-5 shadow-[0_8px_28px_rgba(46,71,125,0.06)]">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-text-primary">Product stakeholders</h2><p className="text-sm text-text-muted">Assign planning responsibilities without changing organization permissions.</p></div>
      <label className="text-xs font-medium text-text-muted">Initiative<select className="ml-2 rounded-lg border border-border-subtle px-3 py-2 text-sm" value={initiativeId} onChange={(event) => setInitiativeId(event.target.value)}>{props.initiatives.map((item) => <option key={item.id} value={item.id}>{item.projectName} — {item.name}</option>)}</select></label>
    </div>
    {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr]">
      <div>
        <h3 className="font-semibold text-text-primary">People</h3>
        <ul className="mt-3 space-y-2">{data?.contacts.map((contact) => <li key={contact.id} className="rounded-xl border border-border-subtle p-3"><div className="flex items-center justify-between gap-2"><p className="font-medium">{contact.displayName}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-xs capitalize">{contact.external ? "External" : "Member"}</span></div><p className="text-xs text-text-muted">{contact.email || "No email"}{contact.company ? ` · ${contact.company}` : ""}</p></li>)}</ul>
        {props.canEdit && <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3">
          <div className="flex gap-2"><Button variant={contactMode === "external" ? "primary" : "secondary"} onClick={() => setContactMode("external")}>External</Button><Button variant={contactMode === "member" ? "primary" : "secondary"} onClick={() => setContactMode("member")}>Organization member</Button></div>
          {contactMode === "member" ? <select className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm" value={memberId} onChange={(event) => setMemberId(event.target.value)}>{props.members.map((member) => <option key={member.id} value={member.id}>{member.name} — {member.email}</option>)}</select> : <><Input placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} /><Input placeholder="Email (optional)" value={email} onChange={(event) => setEmail(event.target.value)} /><Input placeholder="Company (optional)" value={company} onChange={(event) => setCompany(event.target.value)} /></>}
          <Button disabled={pending || (contactMode === "external" ? !name.trim() : !memberId)} onClick={addContact}>Add stakeholder</Button>
        </div>}
      </div>
      <div>
        <h3 className="font-semibold text-text-primary">Active responsibilities</h3>
        {data?.assignments.length ? <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border-subtle text-xs text-text-muted"><th className="p-2">Person</th><th className="p-2">Product role</th><th className="p-2">Responsibility</th><th className="p-2">Engagement</th><th /></tr></thead><tbody>{data.assignments.map((assignment) => <tr key={assignment.id} className="border-b border-border-subtle/70"><td className="p-2 font-medium">{assignment.stakeholder.displayName}</td><td className="p-2">{roleLabel(assignment.productRole)}</td><td className="p-2 text-text-muted">{assignment.responsibility || "Not specified"}</td><td className="p-2 text-xs capitalize text-text-muted">{assignment.influence} influence · {assignment.interest} interest</td><td className="p-2">{props.canEdit && <button className="text-xs text-red-600" disabled={pending} onClick={() => archiveAssignment(assignment)}>Archive</button>}</td></tr>)}</tbody></table></div> : <div className="mt-3"><EmptyState title="No product roles assigned" description="Assign requestors, Product Owners, decision makers, engineers, demo owners, validators, and other stakeholders to planning work." /></div>}
        {props.canEdit && <div className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-3 md:grid-cols-2">
          <select className="rounded-lg border border-border-subtle px-3 py-2 text-sm" value={selectedStakeholderId} onChange={(event) => setStakeholderId(event.target.value)}><option value="">Select stakeholder</option>{data?.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}</select>
          <select className="rounded-lg border border-border-subtle px-3 py-2 text-sm" value={productRole} onChange={(event) => setProductRole(event.target.value as typeof productRole)}>{productRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select>
          <select className="rounded-lg border border-border-subtle px-3 py-2 text-sm" value={targetType} onChange={(event) => setTargetType(event.target.value as TargetType)}>{(["request", "feature", "story", "sprint", "release", "decision"] as TargetType[]).map((type) => <option key={type} value={type}>{roleLabel(type)}</option>)}</select>
          <select className="rounded-lg border border-border-subtle px-3 py-2 text-sm" value={selectedTargetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Select planning item</option>{targetChoices.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</select>
          <Input className="md:col-span-2" placeholder="Responsibility (optional)" value={responsibility} onChange={(event) => setResponsibility(event.target.value)} />
          <Button className="md:col-span-2" disabled={pending || !selectedStakeholderId || !selectedTargetId} onClick={addAssignment}>Assign product role</Button>
        </div>}
      </div>
    </div>
  </section>;
}
