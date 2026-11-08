export interface BareModeInitiative {
  id: string;
  status: string;
}

/** Authentication and route purpose control chrome, never experience or generation. */
export function isBareRoute(pathname: string, signedIn: boolean, currentInitiative: BareModeInitiative | undefined): boolean {
  if (!signedIn) return true;
  void currentInitiative;
  if (pathname === "/") return true;
  if (pathname.startsWith("/welcome")) return true;
  if (pathname.startsWith("/login")) return true;
  if (pathname.startsWith("/onboarding")) return true;
  if (pathname.startsWith("/workflow-preview")) return true;
  // Guided-activation restructure (reference doc §12): /admin/* renders its
  // own separate administrative environment (AdminShell, via admin/layout.tsx)
  // instead of the standard product chrome.
  if (pathname.startsWith("/admin")) return true;
  if (pathname.endsWith("/executive/print")) return true;
  return false;
}
