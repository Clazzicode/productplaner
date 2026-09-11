"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { apiFetch } from "@/lib/clientApi";

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
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? (mode === "sign-up" ? "Could not create your account." : "Could not sign in."));
      return;
    }
    router.push("/home");
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
          />
        </label>

        <Button className="mt-5 w-full" onClick={() => void submit()} disabled={busy || !canSubmit}>
          {busy ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
        </Button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(null);
          }}
          className="mt-4 w-full text-center text-sm font-medium text-accent hover:underline"
        >
          {mode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  );
}
