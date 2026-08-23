// Page layout-mode primitives (docs/V2-APPLICATION-SHELL-BLUEPRINT.md §8). Each
// is a thin positioning/max-width wrapper only — none of them own visual chrome
// (borders/shadows/cards), so a page composes its own content inside. This lets
// a route choose its shape without the shell itself needing to know about it.
//
// FocusedLayout and ContainedLayout are adopted by real pages in this phase.
// WideLayout and TableLayout exist and are ready for future Roadmap/Initiatives-
// table work but are not applied anywhere yet — no such redesign is in scope
// this phase (docs/V2-APPLICATION-SHELL-BLUEPRINT.md §15).

export function FocusedLayout(props: { children: React.ReactNode; className?: string }) {
  return (
    <main className={`mx-auto min-h-screen max-w-2xl px-6 py-12 ${props.className ?? ""}`}>
      {props.children}
    </main>
  );
}

/**
 * Outer positioning only — deliberately does not wrap the bordered/shadowed
 * card that `workspace/layout.tsx` renders inside it, because that card's
 * `print:border-0 print:shadow-none` classes are specific to that one layout
 * (the executive/print route depends on them) and shouldn't become a general
 * primitive's concern.
 */
export function ContainedLayout(props: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto min-h-screen max-w-6xl px-6 py-8 ${props.className ?? ""}`}>{props.children}</div>;
}

export function DashboardLayout(props: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-7xl px-6 py-8 ${props.className ?? ""}`}>{props.children}</div>;
}

export function WideLayout(props: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-[1600px] px-6 py-8 ${props.className ?? ""}`}>{props.children}</div>;
}

export function TableLayout(props: { children: React.ReactNode; className?: string }) {
  return <div className={`px-6 py-8 ${props.className ?? ""}`}>{props.children}</div>;
}
