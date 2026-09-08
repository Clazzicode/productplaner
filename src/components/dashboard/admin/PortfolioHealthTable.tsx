import Link from "next/link";
import { Badge, healthTokenVariant, type BadgeVariant } from "@/components/ui/Badge";
import { CardTitle } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { HEALTH_LABELS } from "@/lib/generation/health";
import type { PortfolioRow } from "@/lib/dashboard/adminDashboardData";

const STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Draft", variant: "neutral" },
  intake_in_progress: { label: "Intake in progress", variant: "amber" },
  generated: { label: "Generated", variant: "emerald" },
};

/** The strongest Admin Dashboard module (docs/V2-ORG-ADMIN-DASHBOARD.md §8):
 * every initiative in the organization, dense CRM-style table, not a card
 * grid — this is the module that most distinguishes the Admin composition
 * from the Standard Dashboard's "Your Initiatives" card. */
export default function PortfolioHealthTable(props: { rows: PortfolioRow[] }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center justify-between p-5 pb-0">
        <CardTitle>Portfolio / Initiative Health</CardTitle>
        <Link href="/initiatives" className="text-xs font-medium text-indigo-600 hover:underline">
          View all →
        </Link>
      </div>
      {props.rows.length === 0 ? (
        <div className="p-5">
          <EmptyState title="No initiatives yet" description="Portfolio health appears once the organization creates its first initiative." />
        </div>
      ) : (
        <div className="mt-3">
          <Table>
            <TableHead>
              <TableHeaderCell>Initiative</TableHeaderCell>
              <TableHeaderCell>Health</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Owner</TableHeaderCell>
              <TableHeaderCell>Team Access</TableHeaderCell>
              <TableHeaderCell>Delivery</TableHeaderCell>
              <TableHeaderCell>Next Milestone</TableHeaderCell>
              <TableHeaderCell>Access</TableHeaderCell>
            </TableHead>
            <TableBody>
              {props.rows.map((row) => {
                const status = STATUS_META[row.status] ?? STATUS_META.draft;
                const href = row.status === "generated" ? `/initiatives/${row.id}/dashboard` : `/initiatives/${row.id}/intake`;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      <Link href={href} className="hover:text-indigo-700 hover:underline">
                        {row.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {row.health ? (
                        <Badge variant={healthTokenVariant(row.health)}>{HEALTH_LABELS[row.health]}</Badge>
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="text-text-muted">{row.ownerName}</TableCell>
                    <TableCell className="text-text-muted">
                      {row.teamAccessCount > 0 ? `${row.teamAccessCount} team${row.teamAccessCount === 1 ? "" : "s"}` : "—"}
                    </TableCell>
                    <TableCell className="text-text-muted">{row.deliveryPercent != null ? `${row.deliveryPercent}%` : "—"}</TableCell>
                    <TableCell className="text-text-muted">
                      {row.nextMilestone ? (
                        <>
                          {row.nextMilestone.label}
                          <span className="ml-1 text-neutral-400">{row.nextMilestone.date.toLocaleDateString()}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-text-muted">
                      <Link href={`/admin/access/${row.id}`} className="hover:text-indigo-700 hover:underline">
                        {row.accessCoverage} grant{row.accessCoverage === 1 ? "" : "s"}
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
