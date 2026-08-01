// Shared surface primitive — same tokens as the existing workspace cards
// (rounded-2xl / border-neutral-200 / bg-white / shadow-sm).

export function Card(props: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm ${props.className ?? ""}`}
    >
      {props.children}
    </section>
  );
}

export function CardTitle(props: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`text-sm font-semibold text-neutral-800 ${props.className ?? ""}`}>
      {props.children}
    </h2>
  );
}
