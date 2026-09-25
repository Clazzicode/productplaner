"use client";

import { useState } from "react";

type LegacyView = "list" | "board";

/**
 * The pre-9B List view and the phase Kanban board (misleadingly labeled
 * "Timeline" before this phase) still have real, working functionality —
 * List's inline title/body editing, Board's phase drag/drop — that Timeline
 * doesn't replace yet. Rather than delete either, they stay reachable here,
 * clearly subordinate to the primary Timeline/Milestones/Connections
 * switcher above, not as equal-weight tabs (docs/V2-ROADMAP-TIMELINE.md
 * §"Legacy RoadmapBoard Status").
 */
export default function RoadmapLegacyViews(props: { list: React.ReactNode; board: React.ReactNode }) {
  const [open, setOpen] = useState<LegacyView | null>(null);

  return (
    <div className="mt-8 border-t border-border-subtle pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Editing tools</span>
        <LegacyButton active={open === "list"} onClick={() => setOpen(open === "list" ? null : "list")}>
          List view (edit titles &amp; descriptions)
        </LegacyButton>
        <LegacyButton active={open === "board"} onClick={() => setOpen(open === "board" ? null : "board")}>
          Board (drag to reassign phase)
        </LegacyButton>
      </div>
      {open === "list" && <div className="mt-4">{props.list}</div>}
      {open === "board" && <div className="mt-4">{props.board}</div>}
    </div>
  );
}

function LegacyButton(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
        props.active
          ? "border-accent bg-accent/10 text-accent"
          : "border-neutral-300 bg-white text-text-secondary hover:bg-neutral-50"
      }`}
    >
      {props.children}
    </button>
  );
}
