"use client";

import { useSyncExternalStore } from "react";
import { readOnboardingState } from "./tempStateClient";
import type { OnboardingState } from "./types";

const EMPTY_STATE: OnboardingState = {};

function subscribe(): () => void {
  // Nothing external mutates this cookie while a component reads it other
  // than this same component's own writeOnboardingState() calls, which
  // already trigger a re-render through other state — no real subscription
  // needed, just an SSR-safe one-time snapshot read on mount.
  return () => {};
}

function getServerSnapshot(): OnboardingState {
  return EMPTY_STATE;
}

/**
 * SSR-safe replacement for the `useEffect(() => setState(readOnboardingState()...))`
 * prefill pattern that used to live in OrganizationSetupForm/WorkingRoleSelector —
 * that pattern trips the `react-hooks/set-state-in-effect` lint rule. Reading a
 * document.cookie value on mount to prefill form state is exactly the kind of
 * external-system read `useSyncExternalStore` is for, just without a real
 * subscription since nothing else mutates this cookie mid-session.
 */
export function useOnboardingStateSnapshot(): OnboardingState {
  return useSyncExternalStore(subscribe, readOnboardingState, getServerSnapshot);
}
