import Link from "next/link";

interface SetupItem {
  label: string;
  done: boolean;
}

/**
 * Guided-activation restructure (reference doc §7): replaces the empty
 * operational dashboard for a user who hasn't created their first initiative
 * yet. One dominant primary action, progress context below it, secondary
 * "what you'll unlock" information last — no card-per-fact treatment (§21).
 *
 * The reference doc's example checklist lists Experience/Role/"Initial
 * planning questions" as three separate completed items ahead of "First
 * initiative." This platform merges the adaptive planning questions into
 * initiative creation itself (Block 3 decision #1) — answering them IS how
 * an initiative gets created — so that checklist is adapted here to reflect
 * that merged reality: Experience and Role are their own checked items, and
 * "Create your first initiative" is the one remaining unchecked step that
 * also covers what the reference doc calls "initial planning questions."
 */
export default function ActivationHome(props: { userName: string; greeting: string }) {
  const firstName = props.userName.trim().split(/\s+/)[0] ?? props.userName;

  const setupItems: SetupItem[] = [
    { label: "Experience selected", done: true },
    { label: "Role selected", done: true },
    { label: "Create your first initiative", done: false },
    { label: "Generate plan", done: false },
    { label: "Review roadmap", done: false },
  ];

  const unlocks = ["Roadmap", "Planning Workspace", "Sprints & Releases", "Risks & Decisions", "Capacity & Cost", "Reports"];

  return (
    <div className="mx-auto max-w-2xl py-10">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent">Your dashboard</p>
      <h1 className="mt-1.5 text-3xl font-bold text-text-primary">
        {props.greeting}, {firstName}
      </h1>
      <p className="mt-2 text-lg text-text-secondary">Let&apos;s build your first product plan.</p>
      <p className="mt-1 text-sm text-text-muted">We&apos;ve used your setup answers to prepare your workspace.</p>

      <div className="mt-10 border-t border-border-subtle pt-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Your next step</p>
        <h2 className="mt-2 text-xl font-semibold text-text-primary">Create your first initiative</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-text-secondary">
          An initiative is the product, launch, improvement, or outcome you want to plan.
        </p>
        <Link
          href="/initiatives/new"
          className="mt-5 inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
        >
          Create Initiative
        </Link>
      </div>

      <div className="mt-10 border-t border-border-subtle pt-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Your setup</p>
        <ul className="mt-3 space-y-2">
          {setupItems.map((item) => (
            <li key={item.label} className="flex items-center gap-2.5 text-sm">
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  item.done ? "bg-accent text-white" : "border border-neutral-300 text-transparent"
                }`}
              >
                ✓
              </span>
              <span className={item.done ? "text-text-secondary" : "font-medium text-text-primary"}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-10 border-t border-border-subtle pt-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">What you&apos;ll unlock</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-text-muted">
          {unlocks.map((label, i) => (
            <span key={label}>
              {label}
              {i < unlocks.length - 1 && <span className="ml-4 text-neutral-300">·</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
