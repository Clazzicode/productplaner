// Restrained enterprise empty-state pattern — no illustrations, no marketing
// copy, one concise line plus an optional action.
export default function EmptyState(props: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
      <p className="text-sm font-semibold text-text-primary">{props.title}</p>
      {props.description && <p className="mx-auto mt-1.5 max-w-md text-sm text-text-muted">{props.description}</p>}
      {props.action && <div className="mt-4">{props.action}</div>}
    </div>
  );
}
