export interface BareModeInitiative {
  id: string;
  status: string;
}

/**
 * Decides whether AppShell renders full chrome or nothing at all. Kept as a pure
 * function (separate from AppShell.tsx) so the bare-mode rules — including the
 * guided-questionnaire exclusion below — are unit-testable without a browser.
 *
 * The guided questionnaire (`/initiatives/[id]/intake`) is bare only while the
 * initiative hasn't been generated yet (first-run guided setup). Once generated,
 * editing intake answers is a normal "living plan" operational task and should
 * keep the user's navigation context — see docs/V2-APPLICATION-SHELL-BLUEPRINT.md
 * §13 and docs/V2-DESIGN-SYSTEM.md.
 *
 * A genuinely not-found initiative (bad/stale link, or the root layout's cached
 * initiative list hasn't caught up with a just-created row) intentionally falls
 * through to the normal shell rather than defaulting to bare — stranding a user
 * in an unstyled bare shell with a 404 and no navigation would be worse than
 * showing the shell around it.
 */
export function isBareRoute(pathname: string, hasProfile: boolean, currentInitiative: BareModeInitiative | undefined): boolean {
  if (!hasProfile) return true;
  if (pathname === "/") return true;
  if (pathname.startsWith("/welcome")) return true;
  if (pathname.startsWith("/login")) return true;
  if (pathname.startsWith("/onboarding")) return true;
  if (pathname.endsWith("/executive/print")) return true;
  if (pathname.endsWith("/intake") && currentInitiative != null && currentInitiative.status !== "generated") {
    return true;
  }
  return false;
}
