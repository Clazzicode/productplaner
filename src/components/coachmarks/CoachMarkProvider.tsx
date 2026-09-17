"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import { COACH_MARK_KEYS, type CoachMarkKey } from "@/lib/coachMarks/keys";

// Directive item 6: a real Next/Back/Skip/End-Tour sequence across the
// existing coach-mark surfaces, reusing per-key dismissal (already
// persisted via POST/DELETE /api/coach-marks) as the tour's only
// persistence — no new "tour progress" table. Resuming a tour just means
// starting at the first not-yet-dismissed step.

const INITIATIVE_SCOPED_ROUTES: Partial<Record<CoachMarkKey, (initiativeId: string) => string>> = {
  roadmap: (id) => `/initiatives/${id}/workspace/roadmap`,
  planning_workspace: (id) => `/initiatives/${id}/workspace/features`,
  sprints_releases: (id) => `/initiatives/${id}/workspace/sprints`,
};
const ALWAYS_REACHABLE_ROUTES: Partial<Record<CoachMarkKey, string>> = {
  projects: "/projects",
  initiatives: "/initiatives",
  integrations: "/integrations",
};

interface TourStep {
  key: CoachMarkKey;
  href: string;
}

/**
 * Reachability filter: the three initiative-scoped keys only render on a
 * page that requires a generated Prototype (loadWorkspace() 404s without
 * one) — a brand-new user has nowhere to navigate to for those yet, so they
 * (and only they) are dropped when `generatedInitiativeId` is null. Order
 * preserved from COACH_MARK_KEYS.
 */
export function buildTourSteps(generatedInitiativeId: string | null): TourStep[] {
  return COACH_MARK_KEYS.flatMap((key) => {
    const alwaysHref = ALWAYS_REACHABLE_ROUTES[key];
    if (alwaysHref) return [{ key, href: alwaysHref }];
    const scoped = INITIATIVE_SCOPED_ROUTES[key];
    if (scoped && generatedInitiativeId) return [{ key, href: scoped(generatedInitiativeId) }];
    return [];
  });
}

interface TourState {
  steps: TourStep[];
  index: number;
}

interface CoachMarkContextValue {
  /** Whether coach marks should render at all for this session — directive
   * §4: shown automatically for Experienced users; everyone else reaches
   * them only via "Replay Product Tour" (which also flips this on for the
   * session, so the replay actually shows something). */
  active: boolean;
  isDismissed: (key: CoachMarkKey) => boolean;
  dismiss: (key: CoachMarkKey) => void;
  replay: () => Promise<void>;
  /** Non-null while a guided Next/Back/Skip/End-Tour sequence is in
   * progress. A CoachMark whose key isn't the current tour step renders in
   * plain ad hoc single-dismiss mode regardless of this being non-null. */
  tour: TourState | null;
  isActiveTourStep: (key: CoachMarkKey) => boolean;
  tourNext: () => void;
  tourBack: () => void;
  tourSkip: () => void;
  endTour: () => void;
}

const CoachMarkContext = createContext<CoachMarkContextValue | null>(null);

export function CoachMarkProvider(props: {
  signedIn: boolean;
  autoActive: boolean;
  /** Most recently updated `status: "generated"` initiative this user can
   * reach — derived once in src/app/layout.tsx from data it already loads
   * for the nav switcher, so this costs zero extra queries. */
  generatedInitiativeId: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [dismissedKeys, setDismissedKeys] = useState<Set<string> | null>(null);
  const [active, setActive] = useState(props.autoActive);
  const [tour, setTour] = useState<TourState | null>(null);
  // Read once, at mount, same contract as the `active` initial state above
  // (a later prop change doesn't retroactively decide whether the tour
  // auto-starts) — captured in refs so the mount effect below can read
  // their current value without listing them as reactive dependencies.
  const autoActiveRef = useRef(props.autoActive);
  const generatedInitiativeIdRef = useRef(props.generatedInitiativeId);

  useEffect(() => {
    if (!props.signedIn) return;
    void apiFetch<{ dismissedKeys: string[] }>("/api/coach-marks").then((res) => {
      const dismissed = new Set(res.ok ? (res.data?.dismissedKeys ?? []) : []);
      setDismissedKeys(dismissed);
      // Auto-activation only ever makes the tour *live* — it never
      // navigates on its own. The routing fix already lands every fresh
      // user on /projects (the tour's own step 0), so the common case needs
      // no forced navigation; a user resuming mid-tour on some other page
      // simply sees that page's mark in ad hoc mode until they next visit
      // step 0's page or hit Replay.
      if (autoActiveRef.current) {
        const steps = buildTourSteps(generatedInitiativeIdRef.current);
        const startIndex = steps.findIndex((s) => !dismissed.has(s.key));
        if (startIndex >= 0) setTour({ steps, index: startIndex });
      }
    });
  }, [props.signedIn]);

  const isDismissed = useCallback((key: CoachMarkKey) => dismissedKeys?.has(key) ?? true, [dismissedKeys]);

  const dismiss = useCallback((key: CoachMarkKey) => {
    setDismissedKeys((prev) => new Set(prev).add(key));
    void apiFetch(`/api/coach-marks/${key}`, { method: "POST" });
  }, []);

  const replay = useCallback(async () => {
    await apiFetch("/api/coach-marks", { method: "DELETE" });
    setDismissedKeys(new Set());
    setActive(true);
    const steps = buildTourSteps(props.generatedInitiativeId);
    setTour({ steps, index: 0 });
    if (steps[0] && steps[0].href !== pathname) router.push(steps[0].href);
  }, [props.generatedInitiativeId, pathname, router]);

  const isActiveTourStep = useCallback(
    (key: CoachMarkKey) => tour != null && tour.steps[tour.index]?.key === key,
    [tour],
  );

  const goToIndex = useCallback(
    (nextIndex: number) => {
      setTour((prev) => {
        if (!prev) return prev;
        if (nextIndex < 0 || nextIndex >= prev.steps.length) return null;
        const nextStep = prev.steps[nextIndex];
        if (nextStep.href !== pathname) router.push(nextStep.href);
        return { steps: prev.steps, index: nextIndex };
      });
    },
    [pathname, router],
  );

  const tourNext = useCallback(() => {
    if (!tour) return;
    dismiss(tour.steps[tour.index].key);
    goToIndex(tour.index + 1);
  }, [tour, dismiss, goToIndex]);

  /** Deliberately does NOT dismiss — a skipped mark can still surface later
   * (ad hoc, or on the next Replay), distinct from Next's "acknowledge and
   * advance." */
  const tourSkip = useCallback(() => {
    if (!tour) return;
    goToIndex(tour.index + 1);
  }, [tour, goToIndex]);

  const tourBack = useCallback(() => {
    if (!tour) return;
    goToIndex(tour.index - 1);
  }, [tour, goToIndex]);

  const endTour = useCallback(() => setTour(null), []);

  return (
    <CoachMarkContext.Provider
      value={{
        active: active && dismissedKeys !== null,
        isDismissed,
        dismiss,
        replay,
        tour,
        isActiveTourStep,
        tourNext,
        tourBack,
        tourSkip,
        endTour,
      }}
    >
      {props.children}
    </CoachMarkContext.Provider>
  );
}

export function useCoachMarks(): CoachMarkContextValue {
  const ctx = useContext(CoachMarkContext);
  if (!ctx) throw new Error("useCoachMarks() must be used inside a CoachMarkProvider.");
  return ctx;
}
