"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { apiFetch } from "@/lib/clientApi";

export default function AcceptWorkspaceInvitation({ email, signedIn }: { email?: string; signedIn: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const fromFragment = window.location.hash.slice(1);
    const saved = fromFragment || sessionStorage.getItem("clarivia_workspace_invite") || "";
    if (fromFragment) {
      sessionStorage.setItem("clarivia_workspace_invite", fromFragment);
      window.history.replaceState(null, "", window.location.pathname);
    }
    const timer = window.setTimeout(() => setToken(saved), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const accept = async () => {
    if (!token) { setMessage("Open the invitation link again to restore its secure code."); return; }
    setBusy(true); setMessage("");
    const result = await apiFetch("/api/workspace-invitations/accept", { method: "POST", body: { token } });
    setBusy(false);
    if (!result.ok) { setMessage(result.error ?? "This invitation could not be accepted."); return; }
    sessionStorage.removeItem("clarivia_workspace_invite");
    router.replace("/"); router.refresh();
  };

  return <main className="mx-auto mt-16 max-w-xl rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Clarivia workspace</p>
    <h1 className="mt-2 text-2xl font-semibold">Join a workspace</h1>
    {signedIn ? <>
      <p className="mt-3 text-sm text-neutral-600">You’re signed in as <strong>{email}</strong>. Accepting adds this account as a workspace member. Your current workspace access is unchanged.</p>
      <Button className="mt-6" disabled={busy || !token} onClick={() => void accept()}>{busy ? "Joining…" : "Accept invitation"}</Button>
    </> : <>
      <p className="mt-3 text-sm text-neutral-600">Sign in or create a Clarivia account with the email address the invitation was sent to. The secure invitation code is kept only in this browser session while you sign in.</p>
      <Link className="mt-6 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white" href="/login?next=%2Fjoin" onClick={() => { if (token) sessionStorage.setItem("clarivia_workspace_invite", token); }}>Continue to sign in</Link>
    </>}
    {message && <p role="alert" className="mt-4 text-sm text-red-700">{message}</p>}
  </main>;
}
