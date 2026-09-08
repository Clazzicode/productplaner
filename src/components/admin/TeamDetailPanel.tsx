"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import { apiFetch } from "@/lib/clientApi";

interface Member {
  id: string;
  name: string;
  email: string;
  memberType: string;
  status: string;
}

interface Candidate {
  id: string;
  name: string;
  email: string;
}

export default function TeamDetailPanel(props: {
  teamId: string;
  isOrgAdmin: boolean;
  members: Member[];
  candidateUsers: Candidate[];
}) {
  const router = useRouter();
  const [members, setMembers] = useState(props.members);
  const [candidates, setCandidates] = useState(props.candidateUsers);
  const [addUserId, setAddUserId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addMember() {
    if (!addUserId) return;
    setPending(true);
    setError(null);
    const result = await apiFetch(`/api/admin/teams/${props.teamId}/members`, {
      method: "POST",
      body: { userId: addUserId },
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't add member.");
      return;
    }
    const candidate = candidates.find((c) => c.id === addUserId)!;
    setMembers((prev) => [...prev, { ...candidate, memberType: "internal", status: "active" }]);
    setCandidates((prev) => prev.filter((c) => c.id !== addUserId));
    setAddUserId("");
    router.refresh();
  }

  async function removeMember(userId: string) {
    setPending(true);
    setError(null);
    const result = await apiFetch(`/api/admin/teams/${props.teamId}/members/${userId}`, { method: "DELETE" });
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't remove member.");
      return;
    }
    const removed = members.find((m) => m.id === userId);
    setMembers((prev) => prev.filter((m) => m.id !== userId));
    if (removed) setCandidates((prev) => [...prev, removed].sort((a, b) => a.name.localeCompare(b.name)));
    router.refresh();
  }

  return (
    <Card>
      <CardTitle>Members</CardTitle>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {members.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">No members yet.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {members.map((m) => (
            <li
              key={m.id}
              className={`flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm ${
                m.status !== "active" ? "opacity-60" : ""
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">{m.name}</span>
                <span className="truncate text-xs text-text-muted">{m.email}</span>
                {m.memberType === "external" && <Badge variant="amber">External</Badge>}
                {m.status !== "active" && <Badge variant="neutral">{m.status === "disabled" ? "Disabled" : "Archived"}</Badge>}
              </span>
              {props.isOrgAdmin && (
                <Button variant="ghost" disabled={pending} onClick={() => removeMember(m.id)}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {props.isOrgAdmin && candidates.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <Select value={addUserId} onChange={(e) => setAddUserId(e.target.value)} className="max-w-xs">
            <option value="">Add member…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
            ))}
          </Select>
          <Button variant="secondary" disabled={pending || !addUserId} onClick={addMember}>
            Add
          </Button>
        </div>
      )}
    </Card>
  );
}
