import Avatar from "@/components/ui/Avatar";

// Desktop and mobile app-chrome bars. Kept as one component (not a generic
// slot-passthrough) because they render genuinely different content, not the
// same content in a different layout: mobile has a hamburger + truncated
// current-initiative title + an avatar that opens the same drawer (its
// account actions live in MobileNavDrawer's bottomContent, not here — a
// second full AccountMenu dropdown has no room in this bar); desktop has the
// full switcher/+New row and account actions inline. Chrome stays light
// (matches the CRM reference's own top bar, which is white, not dark — only
// the nav rail goes dark).
export default function TopHeader(props: {
  switcherAndNew: React.ReactNode;
  accountActions: React.ReactNode;
  currentName: string;
  userName: string;
  onOpenMenu: () => void;
}) {
  return (
    <>
      <header className="no-print sticky top-0 z-30 hidden min-h-[78px] items-center justify-between gap-4 border-b border-border-subtle bg-white/95 px-7 py-2.5 backdrop-blur lg:flex">
        {props.switcherAndNew}
        {props.accountActions}
      </header>
      <header className="no-print flex items-center gap-3 border-b border-border-subtle bg-panel px-4 py-3 lg:hidden">
        <button
          onClick={props.onOpenMenu}
          aria-label="Open menu"
          className="shrink-0 rounded-lg p-1.5 text-text-secondary hover:bg-neutral-100"
        >
          <span className="block h-0.5 w-5 bg-current" />
          <span className="mt-1 block h-0.5 w-5 bg-current" />
          <span className="mt-1 block h-0.5 w-5 bg-current" />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
          {props.currentName}
        </span>
        <button
          type="button"
          onClick={props.onOpenMenu}
          aria-label="Open account menu"
          className="shrink-0 rounded-full"
        >
          <Avatar name={props.userName} />
        </button>
      </header>
    </>
  );
}
