import type { AiAssistItem } from "@prisma/client";
import { beforeEach, expect, it, vi } from "vitest";
const recompute = vi.hoisted(() => vi.fn());
vi.mock("../recomputeFingerprint", () => ({ recomputeFingerprintForItem: recompute }));
import { assertSuggestionFresh } from "../freshness";
beforeEach(() => vi.clearAllMocks());
it.each([null,"different"])("rejects unverified or changed sources (%s)", async fingerprint => {
  recompute.mockResolvedValue(fingerprint);
  await expect(assertSuggestionFresh({ status: "proposed", fingerprint: "original" } as AiAssistItem)).rejects.toMatchObject({ status: 409 });
});
it("rejects an explicitly stale suggestion even when a later source happens to match", async () => {
  recompute.mockResolvedValue("original");
  await expect(assertSuggestionFresh({ status: "stale", fingerprint: "original" } as AiAssistItem)).rejects.toMatchObject({ status: 409 });
});
it("allows explicit review of an unchanged source", async () => {
  recompute.mockResolvedValue("original");
  await expect(assertSuggestionFresh({ status: "proposed", fingerprint: "original" } as AiAssistItem)).resolves.toBeUndefined();
});
