// Presentational-only compact control row (docs/V2-APPLICATION-SHELL-BLUEPRINT.md
// §7) — lays out filter/sort controls consistently; a page supplies its own
// controls as children (e.g. Select instances) and owns the actual filtering
// logic. No filtering behavior lives here.
export default function FilterBar(props: { children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
      <div className="flex flex-wrap items-center gap-2">{props.children}</div>
      {props.trailing && <div className="flex items-center gap-2">{props.trailing}</div>}
    </div>
  );
}
