export default function ChevronIcon({ direction = "right", size = 14, className = "" }: { direction?: "right" | "down"; size?: number; className?: string }) {
  return <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={direction === "down" ? "m3.5 6 4.5 4.5L12.5 6" : "m6 3.5 4.5 4.5L6 12.5"} />
  </svg>;
}
