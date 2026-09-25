"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import { apiFetch } from "@/lib/clientApi";
import {
  ACCESS_LEVEL_LABELS,
  MEMBER_TYPE_LABELS,
  PERMISSION_ROLE_LABELS,
  STATUS_LABELS,
  WORKING_ROLE_LABELS,
} from "@/lib/admin/labels";

interface UserDetail {
  id: string;
  name: string;
  email: string;
  accessLevel: string;
  permissionRole: string;
  workingRole: string | null;
  memberType: string;
  status: string;
}

interface TeamRef {
  id: string;
  name: string;
}

const EMPTY = "__unset__";

/**
 * Every field here writes through PATCH /api/admin/users/[userId], which is
 * where the real access-level gate and last-admin safeguard actually live
 * (docs/V2-USERS-TEAMS.md "Security Limitation") — this component just
 * reflects the server's response, it never decides on its own whether an
 * action is allowed.
 */
export default function UserDetailForm(props: {
  user: UserDetail;
  currentTeams: TeamRef[];
  allTeams: TeamRef[];
}) {
  const router = useRouter();
  const [user, setUser] = useState(props.user);
  const [teams, setTeams] = useState(props.currentTeams);
  const [addTeamId, setAddTeamId] = useState("");
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [pending, setPending] = useState(false);

  const availableTeams = props.allTeams.filter((t) => !teams.some((ct) => ct.id === t.id));

  async function patchUser(patch: Partial<UserDetail>) {
    setPending(true);
    setMessage(null);
    const result = await apiFetch<UserDetail>(`/api/admin/users/${user.id}`, { method: "PATCH", body: patch });
    setPending(false);
    if (!result.ok) {
      setMessage({ text: result.error ?? "Something went wrong.", tone: "error" });
      return;
    }
    setUser((prev) => {
      const next = { ...prev, ...patch };
      // Mirrors PATCH /api/admin/users/[userId]'s OrganizationMember sync: an
      // accessLevel change always writes role "admin"/"member", even for a
      // prior Owner — the route never preserves or reassigns "owner". Kept in
      // sync here so the badge doesn't show a stale tier until next reload.
      if (patch.accessLevel) next.permissionRole = patch.accessLevel === "org_admin" ? "admin" : "member";
      return next;
    });
    setMessage({ text: "Saved.", tone: "ok" });
    router.refresh();
  }

  async function addTeam() {
    if (!addTeamId) return;
    setPending(true);
    setMessage(null);
    const result = await apiFetch(`/api/admin/teams/${addTeamId}/members`, { method: "POST", body: { userId: user.id } });
    setPending(false);
    if (!result.ok) {
      setMessage({ text: result.error ?? "Couldn't add to team.", tone: "error" });
      return;
    }
    const team = props.allTeams.find((t) => t.id === addTeamId)!;
    setTeams((prev) => [...prev, team]);
    setAddTeamId("");
    setMessage({ text: `Added to ${team.name}.`, tone: "ok" });
    router.refresh();
  }

  async function removeTeam(team: TeamRef) {
    setPending(true);
    setMessage(null);
    const result = await apiFetch(`/api/admin/teams/${team.id}/members/${user.id}`, { method: "DELETE" });
    setPending(false);
    if (!result.ok) {
      setMessage({ text: result.error ?? "Couldn't remove from team.", tone: "error" });
      return;
    }
    setTeams((prev) => prev.filter((t) => t.id !== team.id));
    setMessage({ text: `Removed from ${team.name}.`, tone: "ok" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {message && (
        <p className={`text-sm ${message.tone === "ok" ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>
      )}

      <Card>
        <CardTitle>Profile</CardTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-text-muted">Name</p>
            <p className="mt-0.5 text-sm">{user.name}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">Email</p>
            <p className="mt-0.5 text-sm">{user.email}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">Status</p>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={user.status === "active" ? "emerald" : user.status === "disabled" ? "amber" : "neutral"}>
                {STATUS_LABELS[user.status]}
              </Badge>
              {user.status === "active" ? (
                <>
                  <Button variant="secondary" disabled={pending} onClick={() => patchUser({ status: "disabled" })}>
                    Disable
                  </Button>
                  <Button variant="ghost" disabled={pending} onClick={() => patchUser({ status: "archived" })}>
                    Archive
                  </Button>
                </>
              ) : (
                <Button variant="secondary" disabled={pending} onClick={() => patchUser({ status: "active" })}>
                  Re-enable
                </Button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-text-muted">
              Disabling preserves team membership and future grants — re-enabling restores them.
              Archiving is for internal users who&apos;ve permanently left; no internal user is
              ever hard-deleted.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Organization Authority</CardTitle>
        <p className="mt-1 text-xs text-text-muted">What this account can administer — separate from Working Role.</p>
        <div className="mt-2 flex items-center gap-2">
          <Select
            className="max-w-xs"
            value={user.accessLevel}
            disabled={pending}
            onChange={(e) => patchUser({ accessLevel: e.target.value })}
          >
            {Object.entries(ACCESS_LEVEL_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
          {user.permissionRole === "owner" && (
            <Badge variant="indigo" title="Created this organization — this tier can't be reassigned here.">
              {PERMISSION_ROLE_LABELS.owner}
            </Badge>
          )}
        </div>
        {user.permissionRole === "admin" && (
          <p className="mt-1.5 text-[11px] text-text-muted">
            {PERMISSION_ROLE_LABELS.admin} — promoted by the Organization Owner, distinct from the Owner
            themselves.
          </p>
        )}
      </Card>

      <Card>
        <CardTitle>Working Role</CardTitle>
        <p className="mt-1 text-xs text-text-muted">
          Changes dashboard emphasis only — never access. Left unset until this person completes
          onboarding, rather than assigning a role that isn&apos;t truthful yet.
        </p>
        <Select
          className="mt-2 max-w-xs"
          value={user.workingRole ?? EMPTY}
          disabled={pending}
          onChange={(e) => patchUser({ workingRole: e.target.value === EMPTY ? null : e.target.value })}
        >
          <option value={EMPTY}>Not set</option>
          {Object.entries(WORKING_ROLE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
      </Card>

      <Card>
        <CardTitle>Member Type</CardTitle>
        <Select
          className="mt-2 max-w-xs"
          value={user.memberType}
          disabled={pending}
          onChange={(e) => patchUser({ memberType: e.target.value })}
        >
          {Object.entries(MEMBER_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
      </Card>

      <Card>
        <CardTitle>Teams</CardTitle>
        {teams.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">Not on any team yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {teams.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{t.name}</span>
                <Button variant="ghost" disabled={pending} onClick={() => removeTeam(t)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        {availableTeams.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <Select value={addTeamId} onChange={(e) => setAddTeamId(e.target.value)} className="max-w-xs">
              <option value="">Add to team…</option>
              {availableTeams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
            <Button variant="secondary" disabled={pending || !addTeamId} onClick={addTeam}>
              Add
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
