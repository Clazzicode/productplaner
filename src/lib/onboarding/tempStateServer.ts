import { cookies } from "next/headers";
import type { OnboardingState } from "./types";

const COOKIE_NAME = "v2_onboarding";

export async function readOnboardingStateServer(): Promise<OnboardingState> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return {};
  try {
    return JSON.parse(decodeURIComponent(raw)) as OnboardingState;
  } catch {
    return {};
  }
}

/**
 * Clears the onboarding-in-progress cookie. This is browser-scoped, not
 * account-scoped — without clearing it at account boundaries, a browser used
 * to set up more than one account (e.g. someone creating accounts/projects
 * for other people) leaks the previous account's answers (workspace type,
 * working role, org name/size/industry) into the next account's onboarding,
 * silently prefilling or skipping questions it never actually asked that
 * account. Call this once the state has either been persisted (qualifying
 * profile created) or the account boundary is crossed (sign-in/sign-up/sign-out).
 */
export async function clearOnboardingStateServer(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
