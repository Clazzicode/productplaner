"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { apiFetch } from "@/lib/clientApi";

interface OrgOption {
  id: string;
  name: string;
  workspaceType: string;
  role: string;
}

export default function OrganizationSwitcher(props: { activeOrganizationId: string; organizations: OrgOption[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const switchTo = async (organizationId: string) => {
    setBusyId(organizationId);
    setError(null);
    const res = await apiFetch("/api/auth/active-organization", { method: "POST", body: { organizationId } });
    setBusyId(null);
    if (!res.ok) {
      setError(res.error ?? "Could not switch organizations.");
      return;
    }
    router.push("/home");
    router.refresh();
  };

  return (
    <div className="space-y-2.5">
      {props.organizations.map((org) => {
        const isActive = org.id === props.activeOrganizationId;
        return (
          <div
            key={org.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 shadow-sm"
          >
            <div>
              <p className="text-sm font-semibold text-text-primary">{org.name}</p>
              <p className="text-xs text-text-muted">
                {org.workspaceType === "solo" ? "Personal workspace" : "Team workspace"} · {org.role}
              </p>
            </div>
            {isActive ? (
              <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">Active</span>
            ) : (
              <Button
                variant="ghost"
                onClick={() => void switchTo(org.id)}
                disabled={busyId !== null}
              >
                {busyId === org.id ? "Switching…" : "Switch"}
              </Button>
            )}
          </div>
        );
      })}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
