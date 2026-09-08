"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import AccessImpactModal from "./AccessImpactModal";
import { apiFetch } from "@/lib/clientApi";
import { LEVEL_LABELS, type PermissionLevel } from "@/lib/access/resolution";

interface TeamGrant {
  grantId: string;
  teamId: string;
  teamName: string;
  permission: PermissionLevel;
}

interface IndividualGrant {
  grantId: string;
  userId: string;
  userName: string;
  userEmail: string;
  memberType: string;
  status: string;
  permission: PermissionLevel;
}

interface CandidateUser {
  id: string;
  name: string;
  email: string;
  memberType: string;
}

interface CandidateTeam {
  id: string;
  name: string;
}

const LEVEL_OPTIONS: PermissionLevel[] = ["owner", "edit", "view"];

export default function InitiativeAccessPanel(props: {
  initiativeId: string;
  teams: TeamGrant[];
  individuals: IndividualGrant[];
  candidateUsers: CandidateUser[];
  candidateTeams: CandidateTeam[];
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [granteeKind, setGranteeKind] = useState<"user" | "team">("user");
  const [granteeId, setGranteeId] = useState("");
  const [addPermission, setAddPermission] = useState<PermissionLevel>("view");
  const [addError, setAddError] = useState<string | null>(null);
  const [addPending, setAddPending] = useState(false);

  const [impact, setImpact] = useState<{ grantId: string; permission: PermissionLevel | null; label: string } | null>(
    null,
  );

  const selectedUser = props.candidateUsers.find((u) => u.id === granteeId);
  const isExternalCandidate = granteeKind === "user" && selectedUser?.memberType === "external";

  async function submitAdd() {
    if (!granteeId) return;
    setAddPending(true);
    setAddError(null);
    const result = await apiFetch(`/api/admin/access/${props.initiativeId}/grants`, {
      method: "POST",
      body: { granteeType: granteeKind, granteeId, permission: addPermission },
    });
    setAddPending(false);
    if (!result.ok) {
      setAddError(result.error ?? "Couldn't grant access.");
      return;
    }
    setAddOpen(false);
    setGranteeId("");
    setAddPermission("view");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setAddOpen(true)}>+ Add Access</Button>
      </div>

      <Card>
        <CardTitle>Teams</CardTitle>
        {props.teams.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">No team has access yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {props.teams.map((g) => (
              <li key={g.grantId} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                <span className="font-medium">{g.teamName}</span>
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
                  <Button
                    variant="ghost"
                    onClick={() => setImpact({ grantId: g.grantId, permission: null, label: "Revoke access" })}
                  >
                    Revoke
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Individuals</CardTitle>
        {props.individuals.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">No one has direct access yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {props.individuals.map((g) => (
              <li key={g.grantId} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{g.userName}</span>
                  <span className="truncate text-xs text-text-muted">{g.userEmail}</span>
                  {g.memberType === "external" && <Badge variant="amber">External</Badge>}
                  {g.status !== "active" && <Badge variant="neutral">{g.status === "disabled" ? "Disabled" : "Archived"}</Badge>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Select
                    value={g.permission}
                    className="w-auto"
                    onChange={(e) =>
                      setImpact({ grantId: g.grantId, permission: e.target.value as PermissionLevel, label: "Change permission" })
                    }
                  >
                    {(g.memberType === "external" ? (["view"] as PermissionLevel[]) : LEVEL_OPTIONS).map((lvl) => (
                      <option key={lvl} value={lvl}>{LEVEL_LABELS[lvl]}</option>
                    ))}
                  </Select>
                  <Button
                    variant="ghost"
                    onClick={() => setImpact({ grantId: g.grantId, permission: null, label: "Revoke access" })}
                  >
                    Revoke
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {props.teams.length === 0 && props.individuals.length === 0 && (
        <EmptyState title="No access granted yet" description="This initiative isn't reachable by anyone except an Organization Admin (implicit) yet." />
      )}

      <Modal open={addOpen} title="Add Access" onClose={() => setAddOpen(false)}>
        <div className="space-y-3">
          {addError && <p className="text-sm text-red-600">{addError}</p>}
          <div className="flex gap-2">
            <Button
              variant={granteeKind === "team" ? "primary" : "secondary"}
              onClick={() => {
                setGranteeKind("team");
                setGranteeId("");
              }}
            >
              Team
            </Button>
            <Button
              variant={granteeKind === "user" ? "primary" : "secondary"}
              onClick={() => {
                setGranteeKind("user");
                setGranteeId("");
              }}
            >
              Person
            </Button>
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted">{granteeKind === "team" ? "Team" : "Person"}</label>
            <Select className="mt-1" value={granteeId} onChange={(e) => setGranteeId(e.target.value)}>
              <option value="">Choose…</option>
              {granteeKind === "team"
                ? props.candidateTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)
                : props.candidateUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email}){u.memberType === "external" ? " — External" : ""}
                    </option>
                  ))}
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted">Permission</label>
            <Select
              className="mt-1"
              value={addPermission}
              onChange={(e) => setAddPermission(e.target.value as PermissionLevel)}
              disabled={isExternalCandidate}
            >
              {(isExternalCandidate
                ? (["view"] as PermissionLevel[])
                : granteeKind === "team"
                  ? (["edit", "view"] as PermissionLevel[])
                  : LEVEL_OPTIONS
              ).map((lvl) => (
                <option key={lvl} value={lvl}>{LEVEL_LABELS[lvl]}</option>
              ))}
            </Select>
            {isExternalCandidate && (
              <p className="mt-1 text-[11px] text-text-muted">External users can only be granted View.</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button disabled={addPending || !granteeId} onClick={submitAdd}>Grant Access</Button>
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
