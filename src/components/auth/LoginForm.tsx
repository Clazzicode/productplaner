"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import { apiFetch } from "@/lib/clientApi";
import { AuthenticationLoader, ButtonLoader } from "@/components/ui/loading";

// Temporary simplified auth (src/lib/auth/username.ts): username + password
// only, no email collected or shown anywhere in this form.
export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const submit = async () => {
    setBusy(true);
    setError(null);

    const res = await apiFetch(`/api/auth/${mode}`, {
      method: "POST",
      body: { username, password },
    });
    if (!res.ok) {
      setBusy(false);
      setError(res.error ?? (mode === "sign-up" ? "Could not create your account." : "Could not sign in."));
      return;
    }
    // Guided-activation restructure: route through "/" rather than straight
    // to "/home" — root page.tsx is what actually resumes a signed-up user at
    // the correct onboarding step (Workspace Setup / Experience / Role /
    // first initiative). Pushing to "/home" directly used to skip Workspace
    // Setup entirely for a brand-new sign-up, since /home's own guard only
    // ever checked for a QualifyingProfile, not org setup.
    // `busy` deliberately stays true through the redirect — the
    // AuthenticationLoader below disappears the instant this component
    // unmounts, per reference doc §17 ("disappear immediately when
    // authentication completes"), not a moment before.
    router.push("/");
    router.refresh();
  };

  const canSubmit = username.trim().length > 0 && password.trim().length > 0;

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <label className="block text-sm font-medium text-text-primary">
          Username
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1.5"
            placeholder="e.g. jsmith"
            autoComplete="username"
            autoFocus
            disabled={busy}
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-text-primary">
          Password
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            disabled={busy}
          />
        </label>

        <ButtonLoader
          className="mt-5 w-full justify-center"
          onClick={() => void submit()}
          disabled={!canSubmit}
          loading={busy}
          loadingLabel={mode === "sign-in" ? "Signing in" : "Creating account"}
        >
          {mode === "sign-in" ? "Sign in" : "Create account"}
        </ButtonLoader>

        {busy && <AuthenticationLoader label={mode === "sign-in" ? "Signing you in" : "Setting up your workspace"} />}

        <button
          type="button"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(null);
          }}
          disabled={busy}
          className="mt-4 w-full text-center text-sm font-medium text-accent hover:underline disabled:opacity-50"
        >
          {mode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  );
}
