"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import AccessImpactModal from "./AccessImpactModal";
import { apiFetch } from "@/lib/clientApi";
import { LEVEL_LABELS, type PermissionLevel } from "@/lib/access/resolution";

interface TeamGrantRow {
  grantId: string;
  initiativeId: string;
  initiativeName: string;
  initiativeStatus: string;
  permission: PermissionLevel;
}

interface CandidateInitiative {
  id: string;
  name: string;
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: "neutral",
  intake_in_progress: "amber",
  generated: "emerald",
};

/**
 * Team Detail's "Initiative Access" (docs/V2-RESOURCE-ACCESS.md §14) — reads
 * and writes through the identical /api/admin/access/* routes as the main
 * Access page (docs/V2-ORG-ADMIN-IA.md §16 "same underlying grants, only a
 * different lens"), just entered from the team's side.
 */
export default function TeamInitiativeAccessPanel(props: {
  teamId: string;
  isOrgAdmin: boolean;
  grants: TeamGrantRow[];
  candidateInitiatives: CandidateInitiative[];
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [initiativeId, setInitiativeId] = useState("");
  const [permission, setPermission] = useState<PermissionLevel>("view");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [impact, setImpact] = useState<{ grantId: string; permission: PermissionLevel | null; label: string } | null>(
    null,
  );

  async function submitAdd() {
    if (!initiativeId) return;
    setPending(true);
    setError(null);
    const result = await apiFetch(`/api/admin/access/${initiativeId}/grants`, {
      method: "POST",
      body: { granteeType: "team", granteeId: props.teamId, permission },
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't grant access.");
      return;
    }
    setAddOpen(false);
    setInitiativeId("");
    router.refresh();
  }

  return (
    <div>
      {props.grants.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-400">This team doesn&apos;t have access to any initiative yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {props.grants.map((g) => (
            <li key={g.grantId} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <Link href={`/admin/access/${g.initiativeId}`} className="font-medium text-indigo-600 hover:underline">
                  {g.initiativeName}
                </Link>
                <Badge variant={STATUS_VARIANT[g.initiativeStatus] ?? "neutral"}>{g.initiativeStatus}</Badge>
              </span>
              {props.isOrgAdmin && (
                <span className="flex items-center gap-2">
                  <Select
                    value={g.permission}
                    className="w-auto"
                    onChange={(e) =>
                      setImpact({ grantId: g.grantId, permission: e.target.value as PermissionLevel, label: "Change permission" })
                    }
                  >
                    {(["edit", "view"] as PermissionLevel[]).map((lvl) => (
                      <option key={lvl} value={lvl}>{LEVEL_LABELS[lvl]}</option>
                    ))}
                  </Select>
                  <Button variant="ghost" onClick={() => setImpact({ grantId: g.grantId, permission: null, label: "Revoke access" })}>
                    Revoke
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {props.isOrgAdmin && props.candidateInitiatives.length > 0 && (
        <div className="mt-3">
          <Button variant="secondary" onClick={() => setAddOpen(true)}>+ Add initiative access</Button>
        </div>
      )}

      <Modal open={addOpen} title="Add Initiative Access" onClose={() => setAddOpen(false)}>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <label className="text-xs font-medium text-text-muted">Initiative</label>
            <Select className="mt-1" value={initiativeId} onChange={(e) => setInitiativeId(e.target.value)}>
              <option value="">Choose…</option>
              {props.candidateInitiatives.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted">Permission</label>
            <Select className="mt-1" value={permission} onChange={(e) => setPermission(e.target.value as PermissionLevel)}>
              {(["edit", "view"] as PermissionLevel[]).map((lvl) => (
                <option key={lvl} value={lvl}>{LEVEL_LABELS[lvl]}</option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button disabled={pending || !initiativeId} onClick={submitAdd}>Grant Access</Button>
          </div>
        </div>
      </Modal>

      <AccessImpactModal
        open={impact != null}
        onClose={() => setImpact(null)}
        grantId={impact?.grantId ?? null}
        newPermission={impact?.permission ?? null}
        actionLabel={impact?.label ?? ""}
        onConfirmed={() => {
          setImpact(null);
          router.refresh();
        }}
      />
    </div>
  );
}
