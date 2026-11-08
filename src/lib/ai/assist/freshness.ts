import type { AiAssistItem } from "@prisma/client";
import { BusinessError } from "@/lib/businessError";
import { recomputeFingerprintForItem } from "./recomputeFingerprint";
/** Applying a suggestion is consequential: recheck its source in the same transaction. */
export async function assertSuggestionFresh(item: AiAssistItem) {
  const fingerprint = await recomputeFingerprintForItem(item);
  if (item.status === "stale" || !fingerprint || fingerprint !== item.fingerprint) {
    throw new BusinessError("The suggestion's source changed or could not be verified. Refresh and review a new suggestion before applying it.", 409);
  }
}
