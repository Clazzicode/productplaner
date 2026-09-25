"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import { apiFetch } from "@/lib/clientApi";
import { AuthenticationLoader, ButtonLoader } from "@/components/ui/loading";

type Mode = "sign-in" | "sign-up" | "forgot-password";
export default function LoginForm({ linkError = false }: { linkError?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [legacy, setLegacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(linkError ? "This email link is expired or was opened in another browser. Sign in or request a new password reset link." : null);
  const [message, setMessage] = useState<string | null>(null);
  const [identity, setIdentity] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const switchMode = (next: Mode) => {
    setMode(next);
    setLegacy(false);
    setError(null);
    setMessage(null);
    setPassword("");
  };
  const submit = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await apiFetch<{ confirmationRequired?: boolean; message?: string }>(`/api/auth/${mode}`, {
      method: "POST",
      body: { ...(legacy ? { username: identity } : { email: identity }), password, name },
    });
    if (!res.ok) {
      setBusy(false);
      setError(res.error ?? "Please try again.");
      return;
    }
    setPassword("");
    if (mode === "forgot-password" || res.data?.confirmationRequired) {
      setBusy(false);
      setMessage(res.data?.message ?? "Check your email.");
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-md">
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">{mode === "sign-up" ? "Create your account" : mode === "forgot-password" ? "Reset your password" : "Welcome back"}</h2>
        {mode === "sign-up" && <label className="mb-3 block text-sm font-medium">Your name
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} required disabled={busy} className="mt-1.5" />
        </label>}
        <label className="block text-sm font-medium text-text-primary">
          {legacy ? "Existing username" : "Email address"}
          <Input type={legacy ? "text" : "email"} value={identity} onChange={(e) => setIdentity(e.target.value)}
            className="mt-1.5" autoComplete={legacy ? "username" : "email"} autoFocus required disabled={busy} />
        </label>
        {mode !== "forgot-password" && <label className="mt-3 block text-sm font-medium text-text-primary">Password
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={mode === "sign-up" ? 8 : 1} maxLength={128} required disabled={busy} />
        </label>}
        <ButtonLoader type="submit" className="mt-5 w-full justify-center" loading={busy} loadingLabel="Please wait">
          {mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create account" : "Send reset link"}
        </ButtonLoader>
        {busy && <AuthenticationLoader label="Please wait" />}
        {mode === "sign-in" && <button type="button" onClick={() => switchMode("forgot-password")} disabled={busy} className="mt-4 w-full text-sm text-accent hover:underline">Forgot your password?</button>}
        <button type="button" onClick={() => switchMode(mode === "sign-in" ? "sign-up" : "sign-in")} disabled={busy} className="mt-4 w-full text-sm text-accent hover:underline">
          {mode === "sign-in" ? "Need an account? Create one" : "Back to sign in"}
        </button>
        {mode === "sign-in" && <button type="button" onClick={() => { setLegacy(!legacy); setIdentity(""); setError(null); }} disabled={busy} className="mt-4 w-full text-sm text-neutral-500 hover:underline">
          {legacy ? "Use email instead" : "Have an existing username account?"}
        </button>}
        {legacy && <p className="mt-3 text-xs text-neutral-500">Existing accounts keep their workspaces. Password recovery requires a real email address; contact your administrator to migrate a username account.</p>}
      </form>
      {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
      {message && <p role="status" className="mt-4 text-sm text-text-primary">{message}</p>}
    </div>
  );
}
