"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { apiFetch } from "@/lib/clientApi";

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);

    if (mode === "sign-up") {
      const res = await apiFetch<{ needsEmailConfirmation: boolean }>("/api/auth/sign-up", {
        method: "POST",
        body: { name, email, password },
      });
      setBusy(false);
      if (!res.ok) {
        setError(res.error ?? "Could not create your account.");
        return;
      }
      if (res.data?.needsEmailConfirmation) {
        setNotice("Check your email to confirm your account, then sign in.");
        setMode("sign-in");
        return;
      }
      router.push("/home");
      router.refresh();
      return;
    }

    const res = await apiFetch("/api/auth/sign-in", { method: "POST", body: { email, password } });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not sign in.");
      return;
    }
    router.push("/home");
    router.refresh();
  };

  const canSubmit =
    email.trim().length > 0 && password.trim().length > 0 && (mode === "sign-in" || name.trim().length > 0);

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        {mode === "sign-up" && (
          <label className="block text-sm font-medium text-text-primary">
            Name
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" autoFocus />
          </label>
        )}
        <label className="mt-3 block text-sm font-medium text-text-primary">
          Email
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5"
            placeholder="you@example.com"
            autoComplete="email"
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
            setNotice(null);
          }}
          className="mt-4 w-full text-center text-sm font-medium text-accent hover:underline"
        >
          {mode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}
        </button>
      </div>

      {notice && <p className="mt-4 text-sm text-emerald-700">{notice}</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  );
}
