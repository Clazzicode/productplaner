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
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        {props.breadcrumb && <div className="mb-1.5">{<Breadcrumb items={props.breadcrumb} />}</div>}
        {props.eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">{props.eyebrow}</p>
        )}
        <h1 className={`text-2xl font-bold text-text-primary ${props.eyebrow ? "mt-1" : ""}`}>{props.title}</h1>
        {props.description && <p className="mt-1 text-sm text-text-muted">{props.description}</p>}
      </div>
      {(props.primaryAction || props.secondaryActions) && (
        <div className="flex items-center gap-3">
          {props.secondaryActions}
          {props.primaryAction}
        </div>
      )}
    </div>
  );
}
