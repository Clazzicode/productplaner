"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/clientApi";

// Directive §29's exact graduated copy — never a blank/generic message, and
// never a reason to lock a user out of saved work (the banner is purely
// informational; nothing it renders blocks navigation).
const COPY: Record<string, string> = {
  "70": "Your organization is approaching its monthly AI usage allowance.",
  "80": "Your organization is approaching its monthly AI usage allowance.",
  "90": "AI usage is nearly at the monthly limit. Saved planning work remains available.",
  "100": "Your AI usage limit has been reached for this billing period. Existing projects and approved artifacts are still available.",
};

const STYLE: Record<string, string> = {
  "70": "border-amber-200 bg-amber-50 text-amber-800",
  "80": "border-amber-200 bg-amber-50 text-amber-800",
  "90": "border-orange-300 bg-orange-50 text-orange-800",
  "100": "border-red-300 bg-red-50 text-red-800",
};

export default function AiUsageBanner() {
  const [warningLevel, setWarningLevel] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<{ warningLevel: string | null }>("/api/ai-usage-status").then((res) => {
      if (res.ok) setWarningLevel(res.data?.warningLevel ?? null);
    });
  }, []);

  if (!warningLevel) return null;

  return (
    <div className={`mb-4 rounded-xl border px-4 py-2.5 text-sm ${STYLE[warningLevel]}`}>
      {COPY[warningLevel]}
    </div>
  );
}
