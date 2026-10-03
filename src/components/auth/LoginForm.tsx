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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(linkError ? "This email link is expired or was opened in another browser. Sign in or request a new password reset link." : null);
  const [message, setMessage] = useState<string | null>(null);
  const [identity, setIdentity] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setMessage(null);
    setIdentity("");
    setUsername("");
    setName("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
  };
  const submit = async () => {
    if (mode === "sign-up" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await apiFetch<{ confirmationRequired?: boolean; message?: string }>(`/api/auth/${mode}`, {
      method: "POST",
      body: mode === "sign-in"
        ? { identifier: identity, password }
        : mode === "sign-up"
          ? { username, email: identity, password, name }
          : { email: identity },
    });
    if (!res.ok) {
      setBusy(false);
      setError(res.error ?? "Please try again.");
      return;
    }
    setPassword("");
    setConfirmPassword("");
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
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className={`rounded-2xl border p-6 shadow-sm ${mode === "sign-up" ? "border-accent/30 bg-accent/5" : "border-neutral-200 bg-white"}`}>
        {mode !== "forgot-password" && <div role="tablist" aria-label="Account access" className="mb-6 grid grid-cols-2 rounded-xl bg-neutral-100 p-1">
          <button type="button" role="tab" aria-selected={mode === "sign-in"} onClick={() => switchMode("sign-in")} disabled={busy}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${mode === "sign-in" ? "bg-white text-accent shadow-sm ring-1 ring-neutral-200" : "text-neutral-500 hover:text-text-primary"}`}>
            Sign in
          </button>
          <button type="button" role="tab" aria-selected={mode === "sign-up"} onClick={() => switchMode("sign-up")} disabled={busy}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${mode === "sign-up" ? "bg-accent text-white shadow-sm" : "text-neutral-500 hover:text-text-primary"}`}>
            Create account
          </button>
        </div>}
        <h2 className="text-xl font-semibold">{mode === "sign-up" ? "Create a new account" : mode === "forgot-password" ? "Reset your password" : "Welcome back"}</h2>
        <p className="mb-5 mt-1 text-sm text-neutral-500">
          {mode === "sign-up" ? "Choose a username and use a real email for confirmation and recovery." : mode === "forgot-password" ? "We will send a secure reset link to your email." : "Sign in with your username or email address."}
        </p>
        {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
        {message && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-semibold">Account created</p>
          <p className="mt-1">{message}</p>
          <p className="mt-1">You cannot sign in until you open that confirmation link.</p>
        </div>}
        {mode === "sign-up" && <>
          <label className="mb-3 block text-sm font-medium">Username
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" minLength={3} maxLength={30} pattern="[A-Za-z0-9._-]+" required disabled={busy} className="mt-1.5" />
            <span className="mt-1 block text-xs font-normal text-neutral-500">3-30 characters: letters, numbers, dots, underscores, or hyphens.</span>
          </label>
          <label className="mb-3 block text-sm font-medium">Your name
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} required disabled={busy} className="mt-1.5" />
          </label>
        </>}
        <label className="block text-sm font-medium text-text-primary">
          {mode === "sign-in" ? "Username or email" : "Email address"}
          <Input type={mode === "sign-in" ? "text" : "email"} value={identity} onChange={(e) => setIdentity(e.target.value)}
            className="mt-1.5" autoComplete={mode === "sign-in" ? "username" : "email"} autoFocus={mode === "sign-in"} required disabled={busy} />
        </label>
        {mode !== "forgot-password" && <label className="mt-3 block text-sm font-medium text-text-primary">Password
          <span className="relative mt-1.5 block">
            <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-16"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={mode === "sign-up" ? 8 : 1} maxLength={128} required disabled={busy} />
            <button type="button" onClick={() => setShowPassword((visible) => !visible)} disabled={busy}
              className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-accent hover:underline">
              {showPassword ? "Hide" : "Show"}
            </button>
          </span>
          {mode === "sign-up" && <span className="mt-1 block text-xs font-normal text-neutral-500">Use at least 8 characters. Commonly leaked passwords are rejected.</span>}
        </label>}
        {mode === "sign-up" && <label className="mt-3 block text-sm font-medium text-text-primary">Confirm password
          <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1.5"
            autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} />
        </label>}
        <ButtonLoader type="submit" className="mt-5 w-full justify-center" loading={busy} loadingLabel="Please wait">
          {mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create account" : "Send reset link"}
        </ButtonLoader>
        {busy && <AuthenticationLoader label="Please wait" />}
        {mode === "sign-in" && <button type="button" onClick={() => switchMode("forgot-password")} disabled={busy} className="mt-4 w-full text-sm text-accent hover:underline">Forgot your password?</button>}
        {mode === "forgot-password" && <button type="button" onClick={() => switchMode("sign-in")} disabled={busy} className="mt-4 w-full text-sm text-accent hover:underline">Back to sign in</button>}
      </form>
    </div>
  );
}
