"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { apiFetch } from "@/lib/clientApi";
import { formatAccessLabel, type ResolvedAccess } from "@/lib/access/resolution";

interface Impact {
  userId: string;
  userName: string;
  before: ResolvedAccess;
  after: ResolvedAccess;
}

type PermissionOrRevoke = "owner" | "edit" | "view" | null;

/**
 * Shared before/after confirmation for changing or revoking one grant
 * (docs/V2-RESOURCE-ACCESS.md §9/§17) — fetches the preview from the same
 * endpoint regardless of which screen (Admin Access or Team Detail) opened
 * it, then performs the real mutation only on explicit confirm.
 */
export default function AccessImpactModal(props: {
  open: boolean;
  onClose: () => void;
  grantId: string | null;
  /** null = revoke */
  newPermission: PermissionOrRevoke;
  actionLabel: string; // "Change permission" | "Revoke access"
  onConfirmed: () => void;
}) {
  return (
    <Modal open={props.open} title={props.actionLabel} onClose={props.onClose}>
      {props.open && props.grantId && (
        // Keyed so a new grant/permission combo mounts a fresh instance —
        // `loading` then starts true from its own initializer, never from a
        // synchronous setState call inside an effect.
        <ImpactPreviewBody
          key={`${props.grantId}:${props.newPermission ?? "revoke"}`}
          grantId={props.grantId}
          newPermission={props.newPermission}
          onClose={props.onClose}
          onConfirmed={props.onConfirmed}
        />
      )}
    </Modal>
  );
}

function ImpactPreviewBody(props: {
  grantId: string;
  newPermission: PermissionOrRevoke;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [impacts, setImpacts] = useState<Impact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ affected: Impact[] }>(`/api/admin/access/grants/${props.grantId}/preview`, {
      method: "POST",
      body: { permission: props.newPermission },
    }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error ?? "Couldn't load impact preview.");
        return;
      }
      setImpacts(result.data?.affected ?? []);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- grantId/newPermission are the component's key, not reactive deps
  }, []);

  async function confirm() {
    setConfirming(true);
    const result = props.newPermission
      ? await apiFetch(`/api/admin/access/grants/${props.grantId}`, {
          method: "PATCH",
          body: { permission: props.newPermission },
        })
      : await apiFetch(`/api/admin/access/grants/${props.grantId}`, { method: "DELETE" });
    setConfirming(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't apply this change.");
      return;
    }
    props.onConfirmed();
  }

  return (
    <>
      {loading && <p className="text-sm text-neutral-500">Checking impact…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {impacts && (
        <div className="space-y-3">
          {impacts.length === 0 ? (
            <p className="text-sm text-neutral-500">No one is affected by this change.</p>
          ) : (
            <ul className="space-y-2">
              {impacts.map((impact) => {
                const beforeLabel = formatAccessLabel(impact.before.level, impact.before.sourceLabel);
                const afterLabel = formatAccessLabel(impact.after.level, impact.after.sourceLabel);
                const unchanged = impact.before.level === impact.after.level;
                return (
                  <li key={impact.userId} className="rounded-lg border border-neutral-200 p-3 text-sm">
                    <p className="font-medium">{impact.userName}</p>
                    {unchanged ? (
                      <p className="mt-1 text-xs text-neutral-500">
                        No change — still <span className="font-medium">{afterLabel}</span>, via another source.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-neutral-600">
                        <span className="font-medium">{beforeLabel}</span>
                        {" → "}
                        <span className="font-medium">{afterLabel}</span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={props.onClose}>Cancel</Button>
            <Button variant={props.newPermission ? "primary" : "destructive"} disabled={confirming} onClick={confirm}>
              Confirm
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
