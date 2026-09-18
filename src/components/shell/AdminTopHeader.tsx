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
export default function AdminTopHeader(props: { userName: string; accessLevel: string }) {
  return (
    <header className="no-print flex items-center justify-between gap-4 border-b border-border-subtle bg-panel px-6 py-3">
      <span className="text-sm font-semibold text-text-primary">Administration</span>
      <AccountMenu userName={props.userName} accessLevel={props.accessLevel} />
    </header>
  );
}
