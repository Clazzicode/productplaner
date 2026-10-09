"use client";

import Link from "next/link";
import { useState } from "react";
import type { MatrixAudience, MatrixHealth, StakeholderMatrixData } from "@/lib/matrix/stakeholderMatrix";

const AUDIENCE_COPY: Record<MatrixAudience, { label: string; description: string }> = {
  executive: { label: "Executive", description: "Outcomes, investment, confidence, and decisions" },
  product_owner: { label: "Product Owner", description: "Scope, priority, readiness, and follow-through" },
  delivery_team: { label: "Delivery team", description: "Capacity, dependencies, quality, and ownership" },
  stakeholder: { label: "Stakeholder", description: "Timing, impact, engagement, and traceability" },
};

const HEALTH_STYLE: Record<MatrixHealth, string> = {
  healthy: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  watch: "bg-amber-100 text-amber-800 ring-amber-200",
  critical: "bg-rose-100 text-rose-800 ring-rose-200",
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
};

function titleCase(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export default function StakeholderMatrixPortal({ data }: { data: StakeholderMatrixData }) {
  const [audience, setAudience] = useState<MatrixAudience>("product_owner");
  const currentAudience = AUDIENCE_COPY[audience];

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl bg-[linear-gradient(120deg,#0d2144,#253f88_58%,#4d46d7)] px-6 py-7 text-white shadow-[0_18px_48px_rgba(28,50,110,.2)]">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-200">Live stakeholder intelligence</p>
            <h2 className="mt-2 text-2xl font-bold">Matrix portal</h2>
            <p className="mt-2 text-sm leading-6 text-indigo-100">
              One current view of scope, delivery, quality, risk, decisions, evidence, and accountability—organized around what each audience needs to know.
            </p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-right backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wide text-indigo-200">Project</p>
            <p className="font-semibold">{data.initiative.projectName}</p>
            <p className="mt-1 text-xs text-indigo-200">Live as of {new Date(data.generatedAt).toLocaleString()}</p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <HeroStat value={data.summary.features} label="Features" />
          <HeroStat value={data.summary.stories} label="Stories" />
          <HeroStat value={data.summary.readyItems} label="Sprint ready" />
          <HeroStat value={data.summary.openBugs} label="Open bugs" warn={data.summary.openBugs > 0} />
          <HeroStat value={data.summary.openBlockers} label="Blockers" warn={data.summary.openBlockers > 0} />
          <HeroStat value={data.summary.people} label="People" />
        </div>
      </section>

      <section aria-labelledby="audience-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 id="audience-heading" className="text-lg font-bold text-text-primary">Audience lens</h3>
            <p className="mt-1 text-sm text-text-muted">Choose a lens to change the interpretation while keeping the underlying facts consistent.</p>
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Stakeholder audience">
            {(Object.keys(AUDIENCE_COPY) as MatrixAudience[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={audience === key}
                onClick={() => setAudience(key)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${audience === key ? "bg-indigo-600 text-white shadow-sm" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}
              >
                {AUDIENCE_COPY[key].label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
          <p className="font-semibold text-indigo-950">{currentAudience.label}</p>
          <p className="text-sm text-indigo-700">{currentAudience.description}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border-subtle bg-white" aria-labelledby="matrix-heading">
        <div className="border-b border-border-subtle px-5 py-4">
          <h3 id="matrix-heading" className="text-lg font-bold text-text-primary">Planning intelligence matrix</h3>
          <p className="mt-1 text-sm text-text-muted">Each row is calculated from the live plan and links back to its source workspace.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-5 py-3">Domain</th>
                <th className="px-5 py-3">Current measure</th>
                <th className="px-5 py-3">{currentAudience.label} interpretation</th>
                <th className="px-5 py-3 text-right">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {data.rows.map((row) => {
                const lens = row.cells.find((item) => item.audience === audience)!;
                return (
                  <tr key={row.id} className="align-top hover:bg-indigo-50/30">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-text-primary">{row.domain}</p>
                      <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ring-1 ${HEALTH_STYLE[row.health]}`}>{row.health}</span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-2xl font-bold text-text-primary">{row.metric}</p>
                      <p className="text-xs text-text-muted">{row.label}</p>
                    </td>
                    <td className="max-w-xl px-5 py-4">
                      <p className="font-semibold text-text-primary">{lens.headline}</p>
                      <p className="mt-1 text-sm leading-5 text-text-muted">{lens.detail}</p>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link href={row.href} className="text-sm font-semibold text-indigo-600 hover:underline">Open →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <section className="overflow-hidden rounded-2xl border border-border-subtle bg-white" aria-labelledby="accountability-heading">
          <div className="border-b border-border-subtle px-5 py-4">
            <h3 id="accountability-heading" className="text-lg font-bold text-text-primary">Stakeholder accountability matrix</h3>
            <p className="mt-1 text-sm text-text-muted">Product roles and planning responsibility; these assignments do not grant application access.</p>
          </div>
          {data.accountability.length === 0 ? (
            <div className="p-8 text-center text-sm text-text-muted">No stakeholder assignments exist for this initiative yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-text-muted">
                  <tr><th className="px-4 py-3">Person</th><th className="px-4 py-3">Roles</th><th className="px-4 py-3 text-center">Planning</th><th className="px-4 py-3 text-center">Delivery</th><th className="px-4 py-3 text-center">Governance</th><th className="px-4 py-3">Engagement</th></tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {data.accountability.map((person) => (
                    <tr key={person.id}>
                      <td className="px-4 py-4"><p className="font-semibold text-text-primary">{person.name}</p><p className="text-xs text-text-muted">{person.external ? person.company || "External stakeholder" : "Organization member"} · {titleCase(person.influence)} influence / {titleCase(person.interest)} interest</p></td>
                      <td className="px-4 py-4"><div className="flex max-w-64 flex-wrap gap-1">{person.roles.map((role) => <span key={role} className="rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700">{role}</span>)}</div></td>
                      <CoverageCell count={person.planning} />
                      <CoverageCell count={person.delivery} />
                      <CoverageCell count={person.governance} />
                      <td className="max-w-64 px-4 py-4 text-xs text-text-muted">{person.engagementExpectation || "Not specified"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-border-subtle px-5 py-3 text-right"><Link href="/teams" className="text-sm font-semibold text-indigo-600 hover:underline">Manage stakeholders →</Link></div>
        </section>

        <section className="rounded-2xl border border-border-subtle bg-white" aria-labelledby="attention-heading">
          <div className="border-b border-border-subtle px-5 py-4">
            <h3 id="attention-heading" className="text-lg font-bold text-text-primary">Attention queue</h3>
            <p className="mt-1 text-sm text-text-muted">The highest-signal unresolved items across the plan.</p>
          </div>
          <div className="divide-y divide-border-subtle">
            {data.attention.length === 0 ? <p className="p-6 text-sm text-text-muted">No material blockers, severe bugs, risks, questions, or follow-ups are open.</p> : data.attention.map((item) => (
              <Link key={item.id} href={item.href} className="block px-5 py-4 hover:bg-slate-50">
                <div className="flex items-start gap-3">
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.severity === "critical" ? "bg-rose-500" : item.severity === "warning" ? "bg-amber-500" : "bg-blue-500"}`} />
                  <div><p className="text-sm font-semibold text-text-primary">{item.title}</p><p className="mt-1 text-xs text-text-muted">{item.context}{item.owner ? ` · Owner: ${item.owner}` : " · Owner not assigned"}</p></div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border-subtle bg-white p-5" aria-labelledby="sources-heading">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h3 id="sources-heading" className="text-lg font-bold text-text-primary">Source coverage</h3><p className="mt-1 text-sm text-text-muted">Evidence represented in this portal remains linked to its system or captured source.</p></div>
          <div className="flex flex-wrap gap-2">{data.sourceCoverage.length ? data.sourceCoverage.map((source) => <span key={source.label} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">{source.label} · {source.count}</span>) : <span className="text-sm text-text-muted">No source records captured yet.</span>}</div>
        </div>
      </section>
    </div>
  );
}

function HeroStat({ value, label, warn = false }: { value: number; label: string; warn?: boolean }) {
  return <div className={`rounded-xl border px-4 py-3 ${warn ? "border-amber-300/50 bg-amber-300/15" : "border-white/15 bg-white/10"}`}><p className="text-2xl font-bold">{value}</p><p className="text-xs font-medium text-indigo-100">{label}</p></div>;
}

function CoverageCell({ count }: { count: number }) {
  return <td className="px-4 py-4 text-center"><span className={`inline-grid h-8 min-w-8 place-items-center rounded-full px-2 text-xs font-bold ${count > 0 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-400"}`}>{count || "—"}</span></td>;
}
