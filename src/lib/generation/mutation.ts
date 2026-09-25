import { withTransaction, db } from "@/lib/db";
import { auditInitiative } from "@/lib/audit";
import { archiveWorkingVersion } from "./versioning";

/** Preserve the preceding state and commit the mutation and audit together. */
export async function withPlanningMutation<T>(
  initiativeId: string,
  action: string,
  mutate: () => Promise<T>,
  changesPlan = false,
): Promise<T> {
  return withTransaction(async () => {
    const prototype = await db.prototype.findUnique({ where: { initiativeId }, select: { id: true } });
    if (prototype) await archiveWorkingVersion(prototype.id);
    const result = await mutate();
    if (changesPlan && prototype) {
      await db.prototype.update({ where: { id: prototype.id }, data: { approvedAt: null, approvedBaselineJson: null } });
    }
    await auditInitiative(initiativeId, action);
    return result;
  }, { timeout: 120_000 });
}
