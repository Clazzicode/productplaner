"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import Avatar from "@/components/ui/Avatar";
import { ButtonLoader } from "@/components/ui/loading";

/**
 * Guided-activation restructure (reference doc §12): the profile/account
 * dropdown — previously just two plain inline links (Switch organization /
 * Log out), with the avatar+name rendered as a separate element in
 * AppShell. Now one real dropdown, and the entry point for Administration,
 * which used to permanently occupy its own group in the standard product
 * sidebar (removed in Block 5). "Administration" only appears for an
 * `org_admin` — hiding the link is presentation only; every /admin/* page
 * and /api/admin/* route re-checks accessLevel server-side regardless
 * (reference doc §12: "Hiding the UI link alone is not security").
 *
 * The reference doc's example menu lists "Profile" and "Preferences" as two
 * separate items; this app has one personal settings surface
 * (/account/settings, API-key management), not two, so this collapses them
 * into a single accurately-labeled "Account Settings" item rather than
 * inventing a second, redundant, or empty page.
 */
export default function AccountMenu(props: { userName: string; accessLevel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isOrgAdmin = props.accessLevel === "org_admin";

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const logOut = async () => {
    setBusy(true);
    await apiFetch("/api/auth/sign-out", { method: "POST" });
    setBusy(false);
    router.push("/login");
    router.refresh();
  };

  const itemClass =
    "block w-full rounded-lg px-3 py-2 text-left text-sm text-text-primary transition hover:bg-neutral-100";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 text-sm text-neutral-600 transition hover:bg-neutral-100"
      >
        <Avatar name={props.userName} />
        <span className="hidden max-w-32 truncate font-medium sm:inline">{props.userName}</span>
        <span aria-hidden className="text-[10px] text-neutral-400">
          ▼
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg"
        >
          <Link href="/account/settings" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            Account Settings
          </Link>
          <Link href="/organizations" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            Switch Organization
          </Link>

          {isOrgAdmin && (
            <>
              <div className="my-1.5 border-t border-neutral-100" />
              <Link href="/admin" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
                Administration
              </Link>
            </>
          )}

          <div className="my-1.5 border-t border-neutral-100" />
          <ButtonLoader
            type="button"
            variant="plain"
            onClick={() => void logOut()}
            loading={busy}
            loadingLabel="Signing out"
          >
            Sign Out
          </ButtonLoader>
        </div>
      )}
    </div>
  );
}
