import AccountMenu from "@/components/auth/AccountMenu";

/**
 * Admin's own lightweight top bar. AdminShell previously rendered no header
 * at all — the account menu (sign out, switch organization, account
 * settings) and any sense of "which app am I in" lived only in the sidebar,
 * so the chrome looked broken/incomplete compared to the standard product
 * shell's TopHeader. This mirrors that bar's structure (a left label, right
 * account actions) without the initiative switcher, which has no meaning
 * inside Administration.
 */
export default function AdminTopHeader(props: { userName: string; accessLevel: string; onOpenMenu: () => void }) {
  return (
    <header className="no-print flex min-w-0 items-center justify-between gap-3 border-b border-border-subtle bg-panel px-4 py-3 sm:px-6">
      <button
        type="button"
        onClick={props.onOpenMenu}
        aria-label="Open administration menu"
        className="shrink-0 rounded-lg p-1.5 text-text-secondary hover:bg-neutral-100 xl:hidden"
      >
        <span className="block h-0.5 w-5 bg-current" />
        <span className="mt-1 block h-0.5 w-5 bg-current" />
        <span className="mt-1 block h-0.5 w-5 bg-current" />
      </button>
      <span className="text-sm font-semibold text-text-primary">Administration</span>
      <AccountMenu userName={props.userName} accessLevel={props.accessLevel} />
    </header>
  );
}
