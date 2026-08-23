// Extracted from the inline avatar circles duplicated across AppShell/TopHeader.
export default function Avatar(props: { name: string; className?: string }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 ${props.className ?? ""}`}
    >
      {props.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
