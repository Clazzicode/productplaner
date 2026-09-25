import type { RoleRoadmapView } from "@/lib/roadmap/roleRoadmapView";
import ProductRoadmapPanel from "./ProductRoadmapPanel";
import ProjectRoadmapPanel from "./ProjectRoadmapPanel";

/** Thin dispatcher on view.kind — the same initiative, presented through the
 * viewer's Working Role lens. Server-renderable, no client interactivity. */
export default function RoleRoadmapPanel(props: { view: RoleRoadmapView }) {
  return props.view.kind === "project" ? (
    <ProjectRoadmapPanel view={props.view} />
  ) : (
    <ProductRoadmapPanel view={props.view} />
  );
}
