"use client";

import { usePathname } from "next/navigation";
import Breadcrumb from "@/components/ui/Breadcrumb";
import { currentTabLabel } from "./NavTabs";

/**
 * Initiative-context trail (Step 6C — docs/V2-SHELL-COHESION-QA.md "Initiative
 * Context Pattern"): Initiatives → {initiative} → {current workspace section}.
 * The third segment is derived client-side from the URL, sharing NavTabs' own
 * slug→label mapping so the two can never disagree on what a tab is called.
 */
export default function WorkspaceBreadcrumb(props: {
  initiativeId: string;
  initiativeName: string;
  methodology?: string;
  /** Explicit third segment for pages that aren't one of NavTabs' six tabs
   * (e.g. "Guided Intake"). Omit to derive it from the current workspace tab. */
  trailOverride?: string;
}) {
  const pathname = usePathname();
  const trail = props.trailOverride ?? currentTabLabel(pathname, props.methodology);

  return (
    <Breadcrumb
      items={[
        { label: "Initiatives", href: "/initiatives" },
        trail
          ? { label: props.initiativeName, href: `/initiatives/${props.initiativeId}/dashboard` }
          : { label: props.initiativeName },
        ...(trail ? [{ label: trail }] : []),
      ]}
    />
  );
}
