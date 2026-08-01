// Meter primitive — same idiom as the intake wizard's progress track
// (h-1.5 rounded-full bg-neutral-200 with an indigo fill).

export function ProgressBar(props: {
  percent: number; // 0–100+; over 100 renders full and switches to the over color
  over?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, props.percent));
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 ${props.className ?? ""}`}>
      <div
        className={`h-full rounded-full transition-all ${props.over ? "bg-red-500" : "bg-indigo-600"}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
