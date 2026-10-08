"use client";

import { useState } from "react";
import Link from "next/link";
import Input from "@/components/ui/Input";
import { ButtonLoader } from "@/components/ui/loading";
import { apiFetch } from "@/lib/clientApi";

export default function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    if (password !== confirmation) { setError("Passwords do not match."); return; }
    setBusy(true);
    setError(null);
    const result = await apiFetch("/api/auth/reset-password", { method: "POST", body: { password } });
    setBusy(false);
    if (!result.ok) { setError(result.error ?? "Could not update password."); return; }
    setPassword("");
    setConfirmation("");
    setDone(true);
  }
  if (done) return <p role="status">Password updated. <Link className="text-accent underline" href="/login">Sign in with your new password</Link>.</p>;
  return <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-4">
    <label className="block text-sm">New password<Input className="mt-2" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={128} required disabled={busy} /></label>
    <label className="block text-sm">Confirm password<Input className="mt-2" type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} minLength={8} maxLength={128} required disabled={busy} /></label>
    <ButtonLoader type="submit" loading={busy}>Update password</ButtonLoader>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </form>;
}
