// Extracted from the inline avatar circles duplicated across AppShell/TopHeader.
export default function Avatar(props: { name: string; className?: string }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ebe9ff] text-sm font-bold text-[#473ce0] ${props.className ?? ""}`}
    >
      {props.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
