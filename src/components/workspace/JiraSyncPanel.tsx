import Link from "next/link";

/** The workspace header reflects the reviewed Jira Cloud connection. */
export default function JiraSyncPanel(props: {
  status: string;
  lastSyncedAt: string | null;
  projectKey: string | null;
}) {
  const connected = props.status === "connected";
  return (
    <div className="no-print flex flex-wrap items-center gap-2 text-xs">
      <span
        className={`rounded-full px-2.5 py-1 font-medium ${
          connected
            ? "bg-emerald-100 text-emerald-800"
            : "bg-neutral-100 text-neutral-500"
        }`}
      >
        Jira: {connected ? `connected${props.projectKey ? ` · ${props.projectKey}` : ""}` : "not connected"}
      </span>
      <Link href="/integrations/jira" className="font-semibold text-[#5145ed] hover:underline">
        {connected ? "Review Jira sync" : "Connect Jira"}
      </Link>
      {props.lastSyncedAt && (
        <span className="text-neutral-500">
          Last sync {new Date(props.lastSyncedAt).toLocaleString()}
        </span>
      )}
    </div>
  );
}
