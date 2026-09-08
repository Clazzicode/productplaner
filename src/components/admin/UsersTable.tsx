"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import FilterBar from "@/components/ui/FilterBar";
import SearchInput from "@/components/ui/SearchInput";
import Select from "@/components/ui/Select";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { ACCESS_LEVEL_LABELS, MEMBER_TYPE_LABELS, STATUS_LABELS, WORKING_ROLE_LABELS } from "@/lib/admin/labels";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  accessLevel: string;
  workingRole: string | null;
  memberType: string;
  status: string;
  teams: string[];
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  active: "emerald",
  disabled: "amber",
  archived: "neutral",
};

const ALL = "__all__";

export default function UsersTable(props: { users: UserRow[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(ALL);
  const [workingRole, setWorkingRole] = useState(ALL);
  const [memberType, setMemberType] = useState(ALL);
  const [accessLevel, setAccessLevel] = useState(ALL);
  const [team, setTeam] = useState(ALL);

  const allTeams = useMemo(
    () => Array.from(new Set(props.users.flatMap((u) => u.teams))).sort(),
    [props.users],
  );

  const filtered = props.users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
    if (status !== ALL && u.status !== status) return false;
    if (workingRole !== ALL && u.workingRole !== workingRole) return false;
    if (memberType !== ALL && u.memberType !== memberType) return false;
    if (accessLevel !== ALL && u.accessLevel !== accessLevel) return false;
    if (team !== ALL && !u.teams.includes(team)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <FilterBar
        trailing={
          <span className="text-xs text-neutral-400">
            {filtered.length} of {props.users.length}
          </span>
        }
      >
        <SearchInput
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56"
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
          <option value={ALL}>All statuses</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
        <Select value={workingRole} onChange={(e) => setWorkingRole(e.target.value)} className="w-auto">
          <option value={ALL}>All working roles</option>
          {Object.entries(WORKING_ROLE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
        <Select value={memberType} onChange={(e) => setMemberType(e.target.value)} className="w-auto">
          <option value={ALL}>Internal + External</option>
          {Object.entries(MEMBER_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
        <Select value={accessLevel} onChange={(e) => setAccessLevel(e.target.value)} className="w-auto">
          <option value={ALL}>All access levels</option>
          {Object.entries(ACCESS_LEVEL_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
        {allTeams.length > 0 && (
          <Select value={team} onChange={(e) => setTeam(e.target.value)} className="w-auto">
            <option value={ALL}>All teams</option>
            {allTeams.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        )}
      </FilterBar>

      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <Table>
          <TableHead>
            <TableHeaderCell>User</TableHeaderCell>
            <TableHeaderCell>Email</TableHeaderCell>
            <TableHeaderCell>Working Role</TableHeaderCell>
            <TableHeaderCell>Access Level</TableHeaderCell>
            <TableHeaderCell>Member Type</TableHeaderCell>
            <TableHeaderCell>Teams</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Actions</TableHeaderCell>
          </TableHead>
          <TableBody>
            {filtered.map((u) => (
              <TableRow key={u.id} className={u.status !== "active" ? "opacity-60" : ""}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-text-muted">{u.email}</TableCell>
                <TableCell className="text-text-muted">
                  {u.workingRole ? WORKING_ROLE_LABELS[u.workingRole] : <span className="italic">Not set</span>}
                </TableCell>
                <TableCell>{ACCESS_LEVEL_LABELS[u.accessLevel]}</TableCell>
                <TableCell>
                  <Badge variant={u.memberType === "external" ? "amber" : "neutral"}>
                    {MEMBER_TYPE_LABELS[u.memberType]}
                  </Badge>
                </TableCell>
                <TableCell className="text-text-muted">{u.teams.length > 0 ? u.teams.join(", ") : "—"}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[u.status]}>{STATUS_LABELS[u.status]}</Badge>
                </TableCell>
                <TableCell>
                  <Link href={`/admin/users/${u.id}`} className="text-xs font-medium text-indigo-600 hover:underline">
                    Manage →
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-text-muted">
                  No users match these filters.
                </td>
              </tr>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
