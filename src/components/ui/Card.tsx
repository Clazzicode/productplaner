// Shared surface primitive — same tokens as the existing workspace cards
// (rounded-2xl / border-neutral-200 / bg-white / shadow-sm).

export function Card(props: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-xl border border-border-subtle bg-white p-5 shadow-[0_8px_28px_rgba(46,71,125,0.06)] ${props.className ?? ""}`}
    >
      {props.children}
    </section>
  );
}

export function CardTitle(props: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`text-sm font-semibold text-text-primary ${props.className ?? ""}`}>
      {props.children}
    </h2>
  );
}
