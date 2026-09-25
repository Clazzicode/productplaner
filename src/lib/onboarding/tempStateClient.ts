import type { OnboardingState } from "./types";

// Client-side temporary onboarding state, held in a cookie (not Prisma) so
// both the browser (prefill, back-nav) and the root server component
// (routing gate) can read the same value. See docs/V2-ONBOARDING.md.

const COOKIE_NAME = "v2_onboarding";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function readOnboardingState(): OnboardingState {
  if (typeof document === "undefined") return {};
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (!match) return {};
  try {
    return JSON.parse(decodeURIComponent(match[1])) as OnboardingState;
  } catch {
    return {};
  }
}

export function writeOnboardingState(patch: Partial<OnboardingState>) {
  if (typeof document === "undefined") return;
  const next = { ...readOnboardingState(), ...patch };
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
}
