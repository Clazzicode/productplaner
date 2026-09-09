"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, riskBadgeVariant, valueBadgeVariant } from "@/components/ui/Badge";
import { apiFetch } from "@/lib/clientApi";

export interface BoardEpic {
  id: string;
  title: string;
  storyCount: number;
}

export interface BoardFeature {
  id: string;
  capabilityId: string | null;
  title: string;
  isMvp: boolean;
  businessValue: string;
  riskLevel: string | null;
  cost: number | null;
  epics: BoardEpic[];
}

export interface BoardPhase {
  phaseNumber: number;
  name: string;
  features: BoardFeature[];
}

interface MoveResponse {
  landedPhase: number;
  requestedPhase: number;
  cascadedMoves: { capabilityId: string; name: string; fromPhase: number; toPhase: number }[];
  warnings: string[];
}

const money = (n: number) => `~$${Math.round(n).toLocaleString()}`;

/**
 * Visual Kanban-style roadmap: one column per phase. Feature cards are the
 * draggable unit (native HTML5 DnD, no new dependency) — dropping one into a
 * different column reassigns that capability's phase via the move-phase
 * route. Epic sub-tiles are nested inside but never independently drag
 * between phases (they have no independent phase membership).
 */
export default function RoadmapBoard(props: {
  initiativeId: string;
  phases: BoardPhase[];
  locked: boolean;
}) {
  const router = useRouter();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverPhase, setDragOverPhase] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "warning" | "error"; text: string } | null>(null);

  const movePhase = async (capabilityId: string, currentPhase: number, targetPhase: number) => {
    if (currentPhase === targetPhase) return;
    setBusy(true);
    setMessage(null);
    const res = await apiFetch<MoveResponse>(`/api/capabilities/${capabilityId}/move-phase`, {
      method: "POST",
      body: { targetPhase },
    });
    setBusy(false);
    if (!res.ok) {
      setMessage({ kind: "error", text: res.error ?? "Could not move that feature." });
      return;
    }
    const warnings = res.data?.warnings ?? [];
    if (warnings.length > 0) {
      setMessage({ kind: "warning", text: warnings.join(" ") });
    }
    router.refresh();
  };

  return (
    <div>
      {props.locked && (
        <p className="mb-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
          🔒 Roadmap is locked — unlock it to drag features between phases.
        </p>
      )}
      {message && (
        <p
          className={`mb-3 rounded-lg px-3 py-2 text-xs ${
            message.kind === "warning" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {props.phases.map((phase) => {
          const isDropTarget = dragOverPhase === phase.phaseNumber;
          return (
            <div
              key={phase.phaseNumber}
              onDragOver={(e) => {
                if (props.locked) return;
                e.preventDefault();
                setDragOverPhase(phase.phaseNumber);
              }}
              onDragLeave={() => setDragOverPhase((p) => (p === phase.phaseNumber ? null : p))}
              onDrop={(e) => {
                if (props.locked) return;
                e.preventDefault();
                setDragOverPhase(null);
                const capabilityId = e.dataTransfer.getData("text/plain");
                const fromPhase = props.phases.find((p) =>
                  p.features.some((f) => f.capabilityId === capabilityId),
                )?.phaseNumber;
                if (capabilityId && fromPhase != null) {
                  void movePhase(capabilityId, fromPhase, phase.phaseNumber);
                }
              }}
              className={`rounded-2xl p-3 transition ${
                isDropTarget ? "bg-indigo-50 ring-2 ring-indigo-300" : "bg-neutral-50"
              }`}
            >
              <div className="flex items-baseline justify-between px-1">
                <h3 className="text-sm font-semibold text-neutral-700">{phase.name}</h3>
                <span className="text-xs text-neutral-400">{phase.features.length}</span>
              </div>
              <div className="mt-2 space-y-3">
                {phase.features.map((feature) => {
                  const draggable = !props.locked && feature.capabilityId != null && !busy;
                  return (
                    <div
                      key={feature.id}
                      draggable={draggable}
                      onDragStart={(e) => {
                        if (!feature.capabilityId) return;
                        e.dataTransfer.setData("text/plain", feature.capabilityId);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingId(feature.id);
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      className={`rounded-xl border border-neutral-200 bg-white p-2.5 shadow-sm transition ${
                        draggable ? "cursor-grab active:cursor-grabbing" : ""
                      } ${draggingId === feature.id ? "opacity-40" : "opacity-100"}`}
                      title={draggable ? "Drag to move this feature to another phase" : undefined}
                    >
                      <div className="flex items-start justify-between gap-2 px-1">
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-800">
                          {feature.title}
                        </p>
                        {feature.cost != null && (
                          <span className="shrink-0 text-xs font-medium text-neutral-500">
                            {money(feature.cost)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1 px-1">
                        {feature.isMvp && <Badge variant="indigo">MVP</Badge>}
                        <Badge variant={valueBadgeVariant(feature.businessValue)}>
                          {feature.businessValue.replace("_", " ")}
                        </Badge>
                        {feature.riskLevel && (
                          <Badge variant={riskBadgeVariant(feature.riskLevel)}>
                            risk {feature.riskLevel}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {feature.epics.map((epic) => (
                          <div
                            key={epic.id}
                            className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2.5"
                          >
                            <p className="text-sm font-medium text-indigo-900">{epic.title}</p>
                            <p className="mt-0.5 text-xs text-indigo-600">
                              {epic.storyCount} {epic.storyCount === 1 ? "story" : "stories"}
                            </p>
                          </div>
                        ))}
                        {feature.epics.length === 0 && (
                          <p className="px-1 text-xs text-neutral-400">No epics generated yet.</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                {phase.features.length === 0 && (
                  <p className="rounded-lg border border-dashed border-neutral-300 px-3 py-4 text-center text-xs text-neutral-400">
                    {props.locked ? "Nothing in this phase." : "Drop a feature here."}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
