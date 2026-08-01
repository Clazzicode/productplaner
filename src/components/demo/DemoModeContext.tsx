"use client";

import { createContext, useContext, useState } from "react";
import { apiFetch } from "@/lib/clientApi";

interface DemoModeValue {
  enabled: boolean;
  toggle: () => void;
}

const DemoModeContext = createContext<DemoModeValue>({ enabled: false, toggle: () => {} });

/** Seeded from User.demoModeEnabled server-side — no hydration mismatch. */
export function DemoModeProvider(props: { initialEnabled: boolean; children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(props.initialEnabled);
  const toggle = () => {
    const next = !enabled;
    setEnabled(next); // optimistic — persistence failure just reverts on next load
    void apiFetch("/api/preferences/demo-mode", { method: "PATCH", body: { enabled: next } });
  };
  return (
    <DemoModeContext.Provider value={{ enabled, toggle }}>
      {props.children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode(): DemoModeValue {
  return useContext(DemoModeContext);
}
