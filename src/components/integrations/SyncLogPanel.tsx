"use client";

export interface SyncLogView {
  id: string;
  syncType: string;
  status: string;
  itemsProcessed: number;
  message: string;
  startedAt: string;
}

export default function SyncLogPanel(props: { logs: SyncLogView[] }) {
  return (
    <div className="mt-3 rounded-xl bg-neutral-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
        Demo sync history
      </p>
      <ul className="mt-2 space-y-1.5">
        {props.logs.map((log) => (
          <li key={log.id} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 flex-1 text-neutral-600">
              <span
                className={`mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                  log.status === "success" ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              {log.message || log.syncType}
              <span className="ml-1 text-neutral-400">({log.itemsProcessed} items)</span>
            </span>
            <span className="shrink-0 text-neutral-400">
              {new Date(log.startedAt).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
