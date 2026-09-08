"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { apiFetch } from "@/lib/clientApi";

interface AccountOption {
  id: string;
  name: string;
  email: string;
}

export default function LoginForm(props: { users: AccountOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(props.users.length === 0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const switchTo = async (body: { userId: string } | { name: string; email: string }) => {
    setBusy(true);
    setError(null);
    const res = await apiFetch("/api/auth/session", { method: "POST", body });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not switch accounts.");
      return;
    }
    router.push("/home");
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-md">
      {props.users.length > 0 && (
        <ul className="space-y-2.5">
          {props.users.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void switchTo({ userId: u.id })}
                className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-accent/40 hover:bg-accent/[0.03] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Avatar name={u.name} />
                <span>
                  <span className="block text-sm font-semibold text-text-primary">{u.name}</span>
                  <span className="block text-xs text-text-muted">{u.email}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!creating && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-4 w-full rounded-xl border border-dashed border-accent/40 px-4 py-3 text-sm font-semibold text-accent hover:bg-accent/5"
        >
          + Create a new account
        </button>
      )}

      {creating && (
        <div className="mt-6 rounded-2xl border border-accent/20 bg-accent/[0.03] p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">New account</p>
          <label className="mt-3 block text-sm font-medium text-text-primary">
            Name
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" autoFocus />
          </label>
          <label className="mt-3 block text-sm font-medium text-text-primary">
            Email
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5"
              placeholder="you@example.com"
            />
          </label>
          <div className="mt-4 flex justify-end gap-3">
            {props.users.length > 0 && (
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            )}
            <Button
              onClick={() => void switchTo({ name, email })}
              disabled={busy || name.trim().length === 0 || email.trim().length === 0}
            >
              {busy ? "Creating…" : "Create & continue"}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  );
}
