"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import type { CoachMarkKey } from "@/lib/coachMarks/keys";

interface CoachMarkContextValue {
  /** Whether coach marks should render at all for this session — directive
   * §4: shown automatically for Experienced users; everyone else reaches
   * them only via "Replay Product Tour" (which also flips this on for the
   * session, so the replay actually shows something). */
  active: boolean;
  isDismissed: (key: CoachMarkKey) => boolean;
  dismiss: (key: CoachMarkKey) => void;
  replay: () => Promise<void>;
}

const CoachMarkContext = createContext<CoachMarkContextValue | null>(null);

export function CoachMarkProvider(props: { signedIn: boolean; autoActive: boolean; children: React.ReactNode }) {
  const [dismissedKeys, setDismissedKeys] = useState<Set<string> | null>(null);
  const [active, setActive] = useState(props.autoActive);

  useEffect(() => {
    if (!props.signedIn) return;
    void apiFetch<{ dismissedKeys: string[] }>("/api/coach-marks").then((res) => {
      setDismissedKeys(new Set(res.ok ? res.data?.dismissedKeys ?? [] : []));
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
  }, []);

  return (
    <CoachMarkContext.Provider value={{ active: active && dismissedKeys !== null, isDismissed, dismiss, replay }}>
      {props.children}
    </CoachMarkContext.Provider>
  );
}

export function useCoachMarks(): CoachMarkContextValue {
  const ctx = useContext(CoachMarkContext);
  if (!ctx) throw new Error("useCoachMarks() must be used inside a CoachMarkProvider.");
  return ctx;
}
