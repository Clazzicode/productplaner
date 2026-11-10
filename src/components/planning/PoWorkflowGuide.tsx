import Link from "next/link";
import { PO_WORKFLOW, type PoWorkflowId } from "@/lib/planning/poWorkflow";

const CARD_COPY: Record<PoWorkflowId, { purpose: string; benefit: string; outcome: string }> = {
  initiative: {
    purpose: "Define the problem, the customer who needs the change, and what success means.",
    benefit: "Create a clear, shared starting point for the work.",
    outcome: "A well-scoped initiative with a defined problem, customer, and success measure.",
  },
  features: {
    purpose: "Gather requests and maintain a prioritized set of features and bugs.",
    benefit: "Turn ideas and requests into a focused backlog of the most valuable work.",
    outcome: "A prioritized backlog ready for planning.",
  },
  stories: {
    purpose: "Break a feature into user stories and clear acceptance criteria that make the work testable.",
    benefit: "Turn requirements into concrete, verifiable work for engineering.",
    outcome: "Ready-to-build stories with criteria that define done.",
  },
  roadmap: {
    purpose: "Place work into Now, Next, Later, or Unscheduled and add release context.",
    benefit: "Align the team on what is coming, when, and in what release.",
    outcome: "A clear sequence with roadmap placement and release context.",
  },
  sprint: {
    purpose: "Check that work is ready, set a sprint goal, and commit to a focused plan.",
    benefit: "Make a deliberate, realistic commitment with the right work for the next sprint.",
    outcome: "A committed sprint with a clear goal and prioritized, ready-to-build work.",
  },
};

function ToolIcon({ id }: { id: PoWorkflowId }) {
  const shared = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg aria-hidden="true" viewBox="0 0 48 48" className="h-12 w-12 text-[#5145ed] sm:h-14 sm:w-14" {...shared}>
    {id === "initiative" && <><circle cx="22" cy="27" r="15" /><circle cx="22" cy="27" r="9" /><circle cx="22" cy="27" r="3" /><path d="M22 27 39 10m-6 1 6-1-1 6" /></>}
    {id === "features" && <><path d="m24 7 17 9-17 9L7 16 24 7Z" /><path d="m7 24 17 9 17-9M7 32l17 9 17-9" /></>}
    {id === "stories" && <><path d="M11 5h20l7 7v30H11V5Z" /><path d="M31 5v8h7M17 21l2 2 4-4m3 3h7M17 31l2 2 4-4m3 3h7" /></>}
    {id === "roadmap" && <><rect x="7" y="9" width="18" height="10" rx="2" /><rect x="23" y="29" width="18" height="10" rx="2" /><path d="M16 19v8h16v2" /></>}
    {id === "sprint" && <><rect x="7" y="10" width="34" height="32" rx="3" /><path d="M15 6v8m18-8v8M7 19h34m-25 12 5 5 11-12" /></>}
  </svg>;
}

function DownArrow({ reverse = false }: { reverse?: boolean }) {
  const path = reverse ? "M750 0V19Q750 27 742 27H258Q250 27 250 35V62" : "M500 0H258Q250 0 250 8V62";
  return <div aria-hidden="true" className="relative z-0 h-9 md:h-5">
    <svg className="hidden h-full w-full md:block" viewBox="0 0 1000 64" preserveAspectRatio="none" fill="none">
      <path d={path} stroke="#6556f5" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      <path d="m244 53 6 9 6-9" stroke="#6556f5" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <span className="absolute inset-0 grid place-items-center text-2xl font-medium text-[#6556f5] md:hidden">↓</span>
  </div>;
}

function BetweenArrow() {
  return <svg aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-0 hidden h-8 w-11 -translate-x-1/2 -translate-y-1/2 md:block" viewBox="0 0 44 32" fill="none">
    <path d="M1 16h38m-9-9 9 9-9 9" stroke="#6556f5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function ToolCard({ item, number, initiativeId, hasWorkspace }: {
  item: (typeof PO_WORKFLOW)[number]; number: number; initiativeId: string; hasWorkspace: boolean;
}) {
  const copy = CARD_COPY[item.id];
  const needsWorkspace = item.id === "stories" || item.id === "roadmap" || item.id === "sprint";
  const unavailable = needsWorkspace && !hasWorkspace;
  const label = `Open ${item.title}`;
  return <article className="relative z-10 flex min-w-0 flex-col rounded-2xl border border-[#dfe3f4] bg-white p-3 shadow-[0_6px_22px_rgba(32,34,91,0.09)]">
    <div className="flex items-center gap-4">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#ebe8ff] text-sm font-bold text-[#5145ed]">{number}</span>
      <h3 className="text-lg font-bold leading-tight tracking-tight text-[#10172b]">{item.title}</h3>
    </div>
    <div className="mt-1 grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-4">
      <div className="grid h-16 w-16 place-items-center rounded-xl bg-[#f0eeff]"><ToolIcon id={item.id} /></div>
      <dl className="min-w-0 space-y-0.5 text-xs leading-tight text-[#26324a]">
        <div><dt className="inline font-bold text-[#10172b]">Purpose: </dt><dd className="inline">{copy.purpose}</dd></div>
        <div><dt className="inline font-bold text-[#10172b]">How it helps you: </dt><dd className="inline">{copy.benefit}</dd></div>
        <div><dt className="inline font-bold text-[#10172b]">Outcome: </dt><dd className="inline">{copy.outcome}</dd></div>
      </dl>
    </div>
    <div className="mt-auto pt-2">
      {unavailable ? <><span aria-disabled="true" className="inline-flex min-h-7 items-center rounded-lg bg-slate-100 px-4 text-xs font-semibold text-slate-500">{label} →</span><p className="mt-2 text-xs text-slate-600">Create the initial plan to open this tool.</p></> :
        <Link href={`/initiatives/${initiativeId}/${item.destination}`} className="inline-flex min-h-7 items-center rounded-lg bg-[#5145ed] px-4 text-xs font-semibold text-white transition hover:bg-[#4034d0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5145ed]">{label} <span aria-hidden="true" className="ml-2">→</span></Link>}
    </div>
  </article>;
}

export default function PoWorkflowGuide(props: { initiativeId: string; hasWorkspace: boolean }) {
  const [initiative, features, stories, roadmap, sprint] = PO_WORKFLOW;
  return <section className="mx-auto max-w-[940px]" aria-labelledby="five-tool-guide-title">
    <header className="mx-auto max-w-3xl text-center">
      <div aria-hidden="true" className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-white text-[#5145ed] shadow-sm">
        <svg viewBox="0 0 40 40" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 29c0-12 22-4 22-18" /><circle cx="9" cy="30" r="4" /><circle cx="31" cy="10" r="4" /></svg>
      </div>
      <h2 id="five-tool-guide-title" className="mt-2 text-2xl font-extrabold tracking-tight text-[#10172b] sm:text-3xl">From idea to committed sprint</h2>
      <p className="mt-1 text-sm text-[#526080]">Five connected tools. Read the purpose, then open the work.</p>
    </header>

    <div className="mt-5">
      <div className="md:mx-auto md:w-1/2"><ToolCard item={initiative} number={1} initiativeId={props.initiativeId} hasWorkspace={props.hasWorkspace} /></div>
      <DownArrow />
      <div className="relative grid gap-0 md:grid-cols-2 md:gap-10">
        <ToolCard item={features} number={2} initiativeId={props.initiativeId} hasWorkspace={props.hasWorkspace} />
        <BetweenArrow /><div aria-hidden="true" className="grid h-9 place-items-center text-2xl text-[#6556f5] md:hidden">↓</div>
        <ToolCard item={stories} number={3} initiativeId={props.initiativeId} hasWorkspace={props.hasWorkspace} />
      </div>
      <DownArrow reverse />
      <div className="relative grid gap-0 md:grid-cols-2 md:gap-10">
        <ToolCard item={roadmap} number={4} initiativeId={props.initiativeId} hasWorkspace={props.hasWorkspace} />
        <BetweenArrow /><div aria-hidden="true" className="grid h-9 place-items-center text-2xl text-[#6556f5] md:hidden">↓</div>
        <ToolCard item={sprint} number={5} initiativeId={props.initiativeId} hasWorkspace={props.hasWorkspace} />
      </div>
    </div>
  </section>;
}
