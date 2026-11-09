"use client";

import { usePathname } from "next/navigation";
import { WideLayout } from "@/components/layout/PageLayouts";

/** Keep the shared workspace actions reachable without putting a second shell above Roadmap. */
export default function RoadmapWorkspaceFrame(props: {
  header: React.ReactNode;
  roadmapTools: React.ReactNode;
  children: React.ReactNode;
}) {
  const isRoadmap = /^\/initiatives\/[^/]+\/workspace\/roadmap\/?$/.test(usePathname() ?? "");

  if (isRoadmap) {
    return <WideLayout className="!max-w-none !px-0 !py-0">
      <div className="roadmap-route-frame">
        <details className="roadmap-workspace-tools">
          <summary>Workspace context <span aria-hidden>⌄</span></summary>
          <div className="roadmap-workspace-tools-content">{props.roadmapTools}</div>
        </details>
        <main className="min-w-0">{props.children}</main>
      </div>
    </WideLayout>;
  }

  return <WideLayout>
    {props.header}
    <main className="mt-4 min-w-0">{props.children}</main>
  </WideLayout>;
}
