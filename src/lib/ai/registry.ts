import { db } from "@/lib/db";
import type { AiActionKey, AiCapabilityConfig } from "./types";

// AI capability registry (req #5, docs/V2-AI-FOUNDATION.md). Mirrors the
// closest existing precedent, src/lib/sync/integrationSeed.ts's
// ensureProvidersSeeded(): a static seed array + idempotent bootstrap run
// lazily on first use, no separate seed script.
//
// Deliberate deviation from that precedent: the upsert's `update` clause is
// empty, not the full field set. IntegrationProvider re-syncs every field
// from code on every cold start because its fields aren't meant to be
// runtime-tunable. AiCapability's `enabled` flag and usage limits are
// exactly what req #5 asks to be configurable at runtime (e.g. by directly
// editing the row, or a future admin route) — so once a row exists, only
// its *existence* is code-controlled; live enabled/limit values are never
// clobbered by a redeploy or the next serverless cold start.

const AI_CAPABILITIES: AiCapabilityConfig[] = [
  {
    action: "ANALYZE_INTAKE",
    enabled: true,
    maxOutputTokens: 4096,
    userMonthlyLimit: 50,
    organizationMonthlyLimit: 500,
    description:
      "Analyzes an initiative's intake data and returns a qualitative summary, assumptions, missing information, risks, recommended roadmap phases, and rationale.",
  },
];

let seeded = false;

export async function ensureAiCapabilitiesSeeded(): Promise<void> {
  if (seeded) return;
  for (const c of AI_CAPABILITIES) {
    await db.aiCapability.upsert({
      where: { action: c.action },
      update: {},
      create: c,
    });
  }
  seeded = true;
}

export async function getAiCapabilityConfig(action: AiActionKey): Promise<AiCapabilityConfig | null> {
  await ensureAiCapabilitiesSeeded();
  const row = await db.aiCapability.findUnique({ where: { action } });
  if (!row) return null;
  return {
    action: row.action as AiActionKey,
    enabled: row.enabled,
    maxOutputTokens: row.maxOutputTokens,
    userMonthlyLimit: row.userMonthlyLimit,
    organizationMonthlyLimit: row.organizationMonthlyLimit,
    description: row.description,
  };
}
