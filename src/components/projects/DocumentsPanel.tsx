"use client";

import { useState } from "react";
import DocumentReviewPanel from "@/components/documents/DocumentReviewPanel";

// Document Import & Approved Context (directive item 2) — Project Home's
// "Add Documents" entry point, same disclosure shape as RisksPanel/
// DecisionsPanel. Always project_shared: a document uploaded from here has
// no single initiative context to scope to.
export default function DocumentsPanel(props: { projectId: string; experienceLevel?: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-800">Documents</h3>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            + Add document
          </button>
        )}
      </div>

      {open ? (
        <div className="mt-3">
          <DocumentReviewPanel
            scope="project_shared"
            projectId={props.projectId}
            experienceLevel={props.experienceLevel}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 text-xs font-medium text-neutral-500 hover:underline"
          >
            Close
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-neutral-400">
          Upload a business case, requirements doc, or planning document shared across this
          project&apos;s initiatives.
        </p>
      )}
    </div>
  );
}
