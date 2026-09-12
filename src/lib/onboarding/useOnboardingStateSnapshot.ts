"use client";

import { useSyncExternalStore } from "react";
import { readOnboardingState } from "./tempStateClient";
import type { OnboardingState } from "./types";

const EMPTY_STATE: OnboardingState = {};

// useSyncExternalStore requires getSnapshot to return a referentially stable
// value when nothing has actually changed — readOnboardingState() itself
// JSON.parses the cookie fresh on every call, which returns a new object
// every time and sends React into an infinite re-render loop ("Maximum
// update depth exceeded" — caught by browser testing, not by typecheck/lint/
// unit tests, none of which render a real component tree). Cache the parsed
// result, keyed on the raw cookie string, so repeated calls between actual
// cookie writes return the same object reference.
let cachedRawCookie: string | undefined;
let cachedState: OnboardingState = EMPTY_STATE;

function getSnapshot(): OnboardingState {
  const raw = document.cookie;
  if (raw !== cachedRawCookie) {
    cachedRawCookie = raw;
    cachedState = readOnboardingState();
  }
  return cachedState;
}

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
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
