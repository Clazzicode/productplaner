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
