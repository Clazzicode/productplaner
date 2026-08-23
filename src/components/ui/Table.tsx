// Dense table primitives (docs/V2-APPLICATION-SHELL-BLUEPRINT.md §7/§8) —
// compact row density for scanning many records, distinct from the app's
// existing card padding. Deliberately minimal: header/body/row/cell only, no
// built-in sorting/pagination/selection logic — a page wires that itself.

export function Table(props: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto ${props.className ?? ""}`}>
      <table className="w-full text-left text-sm">{props.children}</table>
    </div>
  );
}

export function TableHead(props: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-border-subtle">
      <tr>{props.children}</tr>
    </thead>
  );
}

export function TableHeaderCell(props: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted ${props.className ?? ""}`}
    >
      {props.children}
    </th>
  );
}

export function TableBody(props: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-border-subtle">{props.children}</tbody>;
}

export function TableRow(props: { children: React.ReactNode; selected?: boolean; className?: string }) {
  return (
    <tr className={`transition hover:bg-neutral-50 ${props.selected ? "bg-accent/5" : ""} ${props.className ?? ""}`}>
      {props.children}
    </tr>
  );
}

export function TableCell(props: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 text-text-primary ${props.className ?? ""}`}>{props.children}</td>;
}
