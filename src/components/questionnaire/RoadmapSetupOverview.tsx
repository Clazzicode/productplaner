const ROADMAP_AREAS = [
  {
    title: "1. Product direction",
    detail: "Clarify the problem, audience, and product direction the roadmap should support.",
  },
  {
    title: "2. Outcomes & constraints",
    detail: "Define the result, success metric, target date, and budget.",
  },
  {
    title: "3. Scope & priorities",
    detail: "Describe features and add MVP priority, value, effort, risk, and dependencies.",
  },
  {
    title: "4. Delivery capacity",
    detail: "Set the team size and assumptions that make the schedule realistic.",
  },
  {
    title: "5. Ways of working",
    detail: "Choose a delivery method and the tool the team expects to use.",
  },
  {
    title: "6. Review & build",
    detail: "Use the readiness roadmap now, then build the detailed plan when its core inputs are available.",
  },
] as const;

export default function RoadmapSetupOverview() {
  return (
    <section className="mb-8 rounded-3xl border border-accent/20 bg-accent/[0.04] p-6 md:p-7" aria-labelledby="roadmap-setup-title">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Initiative created</p>
      <h2 id="roadmap-setup-title" className="mt-1.5 text-xl font-semibold tracking-tight text-text-primary">
        Your readiness roadmap starts here
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
        Your starting answers are saved. The readiness roadmap below shows what is known, what to
        answer next, and why each gap matters. These six sections help you strengthen it until a
        prioritized, sequenced, cost-aware product plan can be built.
      </p>
      <ol className="mt-5 grid gap-3 md:grid-cols-2">
        {ROADMAP_AREAS.map((area) => (
          <li key={area.title} className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
            <p className="text-sm font-semibold text-text-primary">{area.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">{area.detail}</p>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs font-medium text-accent">
        The readiness roadmap is available now and changes as you complete the intake.
      </p>
    </section>
  );
}
