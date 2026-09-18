import type { ExistingProjectSummary } from "./ProductDirectionBootstrap";

/**
 * Directive item 21: show what's already known at the Project level as a
 * checklist, rather than a single prose sentence, so the user can see at a
 * glance what they won't be asked again. Deliberately no "Team" row —
 * confirmed via grep that Project.teamCompositionJson has zero read/write
 * sites anywhere in this app (never collected by CreateProjectForm, never
 * accepted by POST /api/projects's schema); rendering a checkmark for data
 * that doesn't really exist would be exactly the kind of fabricated
 * placeholder this codebase's other "Missing, not Derivable" conventions
 * (e.g. docs/V2-ROADMAP-ARCHITECTURE.md §9) explicitly reject.
 */
export default function AlreadyKnownFromProject(props: { project: ExistingProjectSummary }) {
  const { project } = props;

  if (!project.hasContext) {
    return (
      <p className="mt-3 rounded-lg bg-accent/[0.06] px-3 py-2 text-xs text-text-secondary">
        {project.name} doesn&apos;t have shared context set yet — this initiative&apos;s details will
        still become available for future initiatives to reuse.
      </p>
    );
  }

  const rows: { label: string; value: string }[] = [];
  if (project.budget != null) rows.push({ label: "Budget", value: `$${project.budget.toLocaleString()}` });
  if (project.averageHourlyRate != null) {
    rows.push({ label: "Rate", value: `$${project.averageHourlyRate}/hr` });
  }
  if (project.targetLaunchDate != null) {
    rows.push({ label: "Target date", value: new Date(project.targetLaunchDate).toLocaleDateString() });
  }

  if (rows.length === 0) {
    // hasContext is also true when a Project's only real "context" is a
    // prior initiative, with budget/rate/date all still null — a real,
    // reachable state, not an edge case to hide.
    return (
      <p className="mt-3 rounded-lg bg-accent/[0.06] px-3 py-2 text-xs text-text-secondary">
        {project.name} doesn&apos;t have shared budget, rate, or target date set yet — this
        initiative&apos;s details will still become available for future initiatives to reuse.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-lg bg-accent/[0.06] px-3 py-2.5 text-xs text-text-secondary">
      <p className="font-semibold text-text-primary">Already known from {project.name}</p>
      <ul className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-1.5">
            <span className="text-emerald-600">✓</span>
            {row.label} — {row.value}
          </li>
        ))}
      </ul>
      <p className="mt-1.5">You&apos;ll only be asked what&apos;s specific to this initiative.</p>
    </div>
  );
}
