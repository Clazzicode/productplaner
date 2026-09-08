"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";

// Pairs with src/lib/auth/session.ts's cookie-based account switcher — not
// real authentication, just a way to move between prototype accounts.
export default function AccountMenu() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const logOut = async () => {
    setBusy(true);
    await apiFetch("/api/auth/session", { method: "DELETE" });
    setBusy(false);
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
      <Link href="/login" className="rounded-full px-2 py-1 hover:bg-neutral-100 hover:text-neutral-700">
        Switch account
      </Link>
      <button onClick={() => void logOut()} disabled={busy} className="rounded-full px-2 py-1 hover:bg-neutral-100 hover:text-neutral-700">
        Log out
      </button>
    </div>
  );
}
