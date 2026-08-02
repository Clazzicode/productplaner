"use client";

import { useState } from "react";

/**
 * Switches between the existing (server-rendered) List view and the new
 * visual Timeline board, without turning the Roadmap page itself into a
 * Client Component — both are passed in as already-rendered React nodes.
 */
export default function RoadmapViewToggle(props: { list: React.ReactNode; timeline: React.ReactNode }) {
  const [view, setView] = useState<"list" | "timeline">("list");

  return (
    <div>
      <div className="mb-4 inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 text-sm">
        {(["list", "timeline"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-md px-3 py-1.5 font-medium capitalize transition ${
              view === v ? "bg-white text-indigo-700 shadow-sm" : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      {view === "list" ? props.list : props.timeline}
    </div>
  );
}
