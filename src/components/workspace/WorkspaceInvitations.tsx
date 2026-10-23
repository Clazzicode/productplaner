"use client";

import { useEffect, useState } from "react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch } from "@/lib/clientApi";

type Invitation = { id: string; normalizedEmail: string; expiresAt: string; createdAt: string };
export default function WorkspaceInvitations() {
  const [email, setEmail] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteUrl, setInviteUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const result = await apiFetch<{ invitations: Invitation[] }>("/api/workspace-invitations");
    if (result.ok && result.data) setInvitations(result.data.invitations);
  };
  useEffect(() => {
    let cancelled = false;
    void apiFetch<{ invitations: Invitation[] }>("/api/workspace-invitations").then((result) => {
      if (!cancelled && result.ok && result.data) setInvitations(result.data.invitations);
    });
    return () => { cancelled = true; };
  }, []);

  const createInvitation = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(""); setInviteUrl("");
    const result = await apiFetch<{ inviteUrl: string }>("/api/workspace-invitations", { method: "POST", body: { email } });
    setBusy(false);
    if (!result.ok || !result.data) { setMessage(result.error ?? "Could not create invitation."); return; }
    setInviteUrl(result.data.inviteUrl); setEmail(""); setMessage("Invitation created. Copy and send this link to the intended person; it expires in 7 days.");
    await refresh();
  };

  const revoke = async (id: string) => {
    const result = await apiFetch(`/api/workspace-invitations/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!result.ok) { setMessage(result.error ?? "Could not revoke invitation."); return; }
    setInvitations((items) => items.filter((item) => item.id !== id)); setMessage("Invitation revoked.");
  };

  return <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
    <h2 className="text-lg font-semibold">Workspace invitations</h2>
    <p className="mt-1 text-sm text-neutral-600">Invite people as members. They must sign in with the exact verified email address you enter. Links expire after 7 days.</p>
    <form onSubmit={(event) => void createInvitation(event)} className="mt-4 flex flex-col gap-3 sm:flex-row">
      <label className="sr-only" htmlFor="workspace-invite-email">Email address</label>
      <Input id="workspace-invite-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@example.com" />
      <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create invite link"}</Button>
    </form>
    {message && <p role="status" className="mt-3 text-sm text-neutral-700">{message}</p>}
    {inviteUrl && <div className="mt-3 rounded-lg bg-neutral-50 p-3">
      <label htmlFor="workspace-invite-link" className="block text-xs font-semibold">One-time invitation link</label>
      <Input id="workspace-invite-link" readOnly value={inviteUrl} className="mt-1 bg-white" onFocus={(event) => event.currentTarget.select()} />
      <Button type="button" variant="secondary" className="mt-2" onClick={() => void navigator.clipboard?.writeText(inviteUrl)}>Copy link</Button>
    </div>}
    <ul className="mt-5 divide-y divide-neutral-100">
      {invitations.map((invitation) => <li key={invitation.id} className="flex items-center justify-between gap-3 py-3 text-sm">
        <span><span className="font-medium">{invitation.normalizedEmail}</span><span className="ml-2 text-xs text-neutral-500">Expires {new Date(invitation.expiresAt).toLocaleDateString()}</span></span>
        <Button type="button" variant="ghost" onClick={() => void revoke(invitation.id)}>Revoke</Button>
      </li>)}
    </ul>
  </section>;
}
