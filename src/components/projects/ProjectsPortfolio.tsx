"use client";

import Link from "next/link";

type ProjectRow = {
  id: string;
  name: string;
  description: string;
  goal: string;
  initiativeCount: number;
  initiatives: { id: string; name: string }[];
  target: string | null;
  updated: string;
  health: "green" | "yellow" | "red" | null;
  healthReason: string;
};

const healthLabel = { green: "On track", yellow: "Attention", red: "At risk" } as const;

export default function ProjectsPortfolio({ projects, canCreateProject }: { projects: ProjectRow[]; canCreateProject: boolean }) {
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#5145ed]">Portfolio</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#0d1b3e]">Products</h1>
        <p className="mt-2 text-sm text-slate-600">Choose a product to see its goals, decisions, and features.</p>
      </div>
      {canCreateProject && <Link href="/projects/new" className="inline-flex min-h-11 items-center rounded-lg bg-[#5145ed] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#4238d7]">Create product</Link>}
    </div>
    <div id="product-list" className="scroll-mt-20">
      {projects.length === 0 ? <section className="rounded-2xl border border-dashed border-[#ccd2e8] bg-white p-8 text-center">
        <h2 className="font-semibold text-[#0d1b3e]">No products yet</h2>
        <p className="mt-2 text-sm text-slate-600">{canCreateProject ? "Create a product to organize its goals and features." : "A workspace owner or admin can create a product."}</p>
      </section> : <ul className="space-y-3">
        {projects.map(project => <li key={project.id}>
          <Link href={`/projects/${project.id}`} className="group flex min-h-20 flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#dfe3f4] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#a9a9fa] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5145ed] sm:p-5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-semibold text-[#0d1b3e] group-hover:text-[#5145ed]">{project.name}</span>
              <span className="mt-1 block line-clamp-2 text-sm text-slate-600">{project.description || project.goal || "Open this product to see its features."}</span>
            </span>
            <span className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-600">
              <span>{project.initiativeCount} {project.initiativeCount === 1 ? "feature" : "features"}</span>
              <span>Target: {project.target ?? "Not set"}</span>
              <span>{project.health ? healthLabel[project.health] : "Health not assessed"}</span>
              <span className="font-semibold text-[#5145ed]">Open product →</span>
            </span>
          </Link>
        </li>)}
      </ul>}
    </div>
  </div>;
}
