import Link from "next/link";
import type { AdminOrgSummary } from "@/lib/dashboard/adminDashboardData";

interface Tile {
  label: string;
  value: number;
  note?: string;
  href: string;
  emphasize?: boolean;
}

/** Compact top-level metrics row — Users | Teams | Initiatives | Attention |
 * Releases, per docs/V2-ORG-ADMIN-DASHBOARD.md's composition. Denser than
 * any Standard Dashboard widget: five tiles in one strip, not one Card per
 * metric. */
export default function OrgSummaryStrip(props: { summary: AdminOrgSummary }) {
  const s = props.summary;
  const tiles: Tile[] = [
    {
      label: "Users",
      value: s.activeUsers,
      note: s.disabledUsers > 0 ? `${s.disabledUsers} disabled` : `${s.totalUsers} total`,
      href: "/admin/users",
    },
    { label: "Teams", value: s.teams, note: `${s.orgAdmins} admin${s.orgAdmins === 1 ? "" : "s"}`, href: "/teams" },
    { label: "Initiatives", value: s.activeInitiatives, note: "in portfolio", href: "/initiatives" },
    {
      label: "Attention",
      value: s.attentionCount,
      note: s.attentionCount === 0 ? "all clear" : "needs review",
      href: "#admin-attention",
      emphasize: s.attentionCount > 0,
    },
    { label: "Releases", value: s.upcomingReleases, note: "upcoming", href: "#admin-timeline" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t.label}</p>
          <p className={`mt-1 text-2xl font-bold ${t.emphasize ? "text-health-attention" : "text-text-primary"}`}>{t.value}</p>
          {t.note && <p className="mt-0.5 text-xs text-text-muted">{t.note}</p>}
        </Link>
      ))}
    </div>
  );
}
