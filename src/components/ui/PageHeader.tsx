import Breadcrumb, { type BreadcrumbItem } from "./Breadcrumb";

// Page-content-level header (title/description/primary action) — distinct from
// the shell-level TopHeader, which owns the app chrome (switcher, avatar, etc.).
// A page renders this inside its own content area.
export default function PageHeader(props: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  breadcrumb?: BreadcrumbItem[];
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-28 flex-wrap items-start justify-between gap-4 overflow-hidden rounded-2xl border border-[#e5ebfa] bg-[linear-gradient(105deg,#ffffff_0%,#ffffff_58%,#f0f4ff_100%)] px-6 py-5 shadow-[0_8px_28px_rgba(53,79,135,0.05)]">
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden w-[38%] overflow-hidden md:block">
        <svg viewBox="0 0 520 150" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
          <circle cx="424" cy="26" r="14" fill="#cfd7ff" opacity=".75" />
          <path d="M38 134 140 52l55 55 60-78 86 92 44-44 90 57Z" fill="#e5e9ff" />
          <path d="m104 134 93-62 50 48 68-49 86 63Z" fill="#dce4ff" opacity=".72" />
          <g fill="#aebaff" opacity=".8"><path d="m188 109 13-42 13 42h-9v26h-8v-26Z"/><path d="m286 114 12-37 12 37h-8v22h-8v-22Z"/><path d="m371 116 11-35 11 35h-7v20h-8v-20Z"/></g>
        </svg>
      </div>
      <div className="relative z-10 min-w-0 max-w-4xl">
        {props.breadcrumb && <div className="mb-1.5">{<Breadcrumb items={props.breadcrumb} />}</div>}
        {props.eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">{props.eyebrow}</p>
        )}
        <h1 className={`break-words text-2xl font-bold tracking-[-0.02em] text-text-primary lg:text-3xl ${props.eyebrow ? "mt-1" : ""}`}>
          {props.title}
        </h1>
        {props.description && <p className="mt-1 max-w-3xl text-sm text-text-secondary">{props.description}</p>}
      </div>
      {(props.primaryAction || props.secondaryActions) && (
        <div className="relative z-10 flex items-center gap-3">
          {props.secondaryActions}
          {props.primaryAction}
        </div>
      )}
    </div>
  );
}
