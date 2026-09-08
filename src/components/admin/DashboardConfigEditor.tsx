"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { apiFetch } from "@/lib/clientApi";
import type { RoleWidgetConfigView } from "@/lib/dashboard/dashboardConfiguration";
import type { WorkingRole } from "@/lib/onboarding/types";

/**
 * Step 8E admin editor (docs/V2-DASHBOARD-CONFIGURATION.md) — same
 * local-state + `apiFetch` shape `TeamsList.tsx` already uses. Configuration
 * UI, not a dashboard preview: dense toggle rows, not the Card treatment
 * `/home`/`/admin` render widgets in.
 *
 * State resync on a role switch uses React's documented "adjust state
 * during render" pattern (comparing the incoming prop to a tracked previous
 * value and calling setState directly, not inside an effect) rather than a
 * `useEffect` that copies props into state — the latter is the exact
 * anti-pattern already flagged elsewhere in this codebase's lint output.
 */
export default function DashboardConfigEditor(props: {
  workingRole: WorkingRole;
  roleLabel: string;
  widgets: RoleWidgetConfigView[];
}) {
  const router = useRouter();
  const [trackedRole, setTrackedRole] = useState(props.workingRole);
  const [widgets, setWidgets] = useState(props.widgets);
  const [saved, setSaved] = useState(props.widgets);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (trackedRole !== props.workingRole) {
    setTrackedRole(props.workingRole);
    setWidgets(props.widgets);
    setSaved(props.widgets);
    setError(null);
    setMessage(null);
  }

  const dirty = widgets.some((w, i) => w.visible !== saved[i]?.visible);

  function toggle(id: string) {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)));
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const result = await apiFetch<{ widgets: RoleWidgetConfigView[] }>(
      `/api/admin/dashboard-config/${props.workingRole}`,
      { method: "POST", body: { widgets: widgets.map((w) => ({ id: w.id, visible: w.visible })) } },
    );
    setSaving(false);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Couldn't save configuration.");
      return;
    }
    setWidgets(result.data.widgets);
    setSaved(result.data.widgets);
    setMessage(`Saved ${props.roleLabel} dashboard configuration.`);
    router.refresh();
  }

  async function reset() {
    setResetting(true);
    setError(null);
    const result = await apiFetch<{ widgets: RoleWidgetConfigView[] }>(
      `/api/admin/dashboard-config/${props.workingRole}`,
      { method: "DELETE" },
    );
    setResetting(false);
    setResetOpen(false);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Couldn't reset configuration.");
      return;
    }
    setWidgets(result.data.widgets);
    setSaved(result.data.widgets);
    setMessage(`Reset ${props.roleLabel} dashboard to default widgets.`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && !dirty && <p className="text-sm font-medium text-health-good">{message}</p>}

      <div className="divide-y divide-border-subtle rounded-2xl border border-neutral-200 bg-white">
        {widgets.map((w) => (
          <div key={w.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-text-primary">{w.title}</p>
                {!w.isOverridden && (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                    Default
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-text-muted">{w.description}</p>
            </div>
            <button
              type="button"
              onClick={() => toggle(w.id)}
              aria-pressed={w.visible}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
                w.visible ? "bg-health-good/10 text-health-good" : "bg-neutral-100 text-text-muted"
              }`}
            >
              {w.visible ? "On" : "Off"}
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={() => setResetOpen(true)} disabled={resetting}>
          Reset to Defaults
        </Button>
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>

      <Modal open={resetOpen} title="Reset to defaults" onClose={() => setResetOpen(false)}>
        <p className="text-sm text-text-secondary">
          Reset {props.roleLabel} dashboard to default widgets? This removes any saved overrides for this role — you
          can reconfigure it again at any time.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setResetOpen(false)}>
            Cancel
          </Button>
          <Button onClick={reset} disabled={resetting}>
            {resetting ? "Resetting…" : "Reset to Defaults"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
