"use client";

import { useDemoMode } from "./DemoModeContext";

export default function DemoModeToggle() {
  const { enabled, toggle } = useDemoMode();
  return (
    <button
      onClick={toggle}
      title="Demo Explanation Mode overlays callouts that explain what each section does and how it connects to the planning chain."
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        enabled
          ? "border-indigo-300 bg-indigo-50 text-indigo-700"
          : "border-neutral-300 bg-white text-neutral-500 hover:text-neutral-800"
      }`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${enabled ? "bg-indigo-600" : "bg-neutral-300"}`}
      />
      Explain mode {enabled ? "on" : "off"}
    </button>
  );
}
