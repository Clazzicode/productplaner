"use client";

import { usePathname } from "next/navigation";
import { WideLayout } from "@/components/layout/PageLayouts";

/** Keep the shared workspace actions reachable without putting a second shell above Roadmap. */
export default function RoadmapWorkspaceFrame(props: {
  header: React.ReactNode;
  roadmapTools: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const isRoadmap = /^\/initiatives\/[^/]+\/workspace\/roadmap\/?$/.test(pathname);
  const isDemoDetail = /^\/initiatives\/[^/]+\/workspace\/demos(?:\/.*)?$/.test(pathname);

  if (isDemoDetail) {
    return <WideLayout className="!max-w-none !px-0 !py-0"><div className="min-w-0">{props.children}</div><details className="mx-4 mb-6 rounded-xl border border-[#dfe3f4] bg-white p-4 sm:mx-7 lg:mx-9"><summary className="cursor-pointer text-sm font-semibold text-[#5145ed]">Workspace context and history</summary><div className="mt-4 space-y-4">{props.header}{props.roadmapTools}</div></details></WideLayout>;
  }

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
