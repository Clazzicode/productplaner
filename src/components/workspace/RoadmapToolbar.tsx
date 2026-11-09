/**
 * Roadmap page shell: title + (optional) secondary/legacy links, above the
 * primary Timeline/Milestones/Connections switcher. Zoom and Filters are
 * intentionally NOT here — they're Timeline-specific controls owned by
 * TimelineRoadmap, since Milestones/Connections don't have them yet and a
 * global toolbar showing quarter/year zoom over a disabled Milestones tab
 * would be misleading (docs/V2-ROADMAP-TIMELINE.md §"Roadmap Toolbar").
 */
export default function RoadmapToolbar(props: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="roadmap-page">
      <div className="roadmap-page-heading">
        <h1>{props.title}</h1>
        {props.description && <p>{props.description}</p>}
      </div>
      {props.children}
    </div>
  );
}
