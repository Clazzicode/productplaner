"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Textarea from "@/components/ui/Textarea";
import { apiFetch } from "@/lib/clientApi";

export interface TeamRow {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  externalCount: number;
}

export default function TeamsList(props: { isOrgAdmin: boolean; teams: TeamRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function createTeam() {
    setPending(true);
    setError(null);
    const result = await apiFetch<{ id: string }>("/api/admin/teams", {
      method: "POST",
      body: { name, description: description || undefined },
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't create team.");
      return;
    }
    setOpen(false);
    setName("");
    setDescription("");
    router.refresh();
    if (result.data?.id) router.push(`/teams/${result.data.id}`);
  }

  return (
    <div>
      {props.isOrgAdmin && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setOpen(true)}>+ Create team</Button>
        </div>
      )}

      {props.teams.length === 0 ? (
        <EmptyState
          title="No teams yet"
          description="Teams group people so they can be granted access to initiatives together, once Step 8C ships."
        />
      ) : (
        <ul className="space-y-2">
          {props.teams.map((t) => (
            <li key={t.id}>
              <Link
                href={`/teams/${t.id}`}
                className="block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-text-primary">{t.name}</p>
                  <p className="text-xs text-text-muted">
                    {t.memberCount} {t.memberCount === 1 ? "member" : "members"}
                    {t.externalCount > 0 && ` (${t.externalCount} external)`}
                  </p>
                </div>
                {t.description && <p className="mt-1 text-sm text-text-muted">{t.description}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} title="Create team" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <label className="text-xs font-medium text-text-muted">Team name</label>
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted">Description (optional)</label>
            <Textarea className="mt-1" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending || !name.trim()} onClick={createTeam}>Create team</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
