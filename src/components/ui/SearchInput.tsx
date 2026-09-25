// Presentational only — no global search exists yet to wire this to
// (docs/V2-APPLICATION-SHELL-BLUEPRINT.md §1). A page that adopts this owns its
// own filtering; this component just renders the input consistently.
export default function SearchInput(
  props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">,
) {
  const { className, placeholder, ...rest } = props;
  return (
    <div className={`relative ${className ?? ""}`}>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="M17 17l-3.8-3.8" strokeLinecap="round" />
      </svg>
      <input
        {...rest}
        type="search"
        placeholder={placeholder ?? "Search…"}
        className="w-full rounded-lg border border-neutral-300 py-2 pl-8 pr-3 text-sm text-text-primary focus:border-accent focus:outline-none"
      />
    </div>
  );
}
