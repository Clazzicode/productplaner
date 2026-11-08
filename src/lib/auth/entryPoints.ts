import { withApi } from "@/lib/observability";
import { withAuthenticatedDatabaseContext } from "@/lib/db";
import { getCurrentUser, requireCurrentUser, requireCurrentUserApi } from "./session";
import { withVerifiedRequest } from "./verifiedRequest";

/** Preserves withApi origin, rate-limit and logging protections as the outer
 * boundary. Legacy handlers reuse the verified identity without a second
 * Supabase request while retaining their action-specific authorization. */
export function withAuthenticatedApi<T extends unknown[]>(handler: (...args: T) => Promise<Response>, options?: Parameters<typeof withApi>[1]) {
  return withApi(async (...args: T) => {
    const auth = await requireCurrentUserApi();
    if (!auth.ok) return auth.response;
    return withAuthenticatedDatabaseContext(auth.user, async () =>
      await withVerifiedRequest(auth.user, async () => await handler(...args)));
  }, options);
}

export function withAuthenticatedPage<T extends unknown[], R>(handler: (...args: T) => Promise<R>) {
  return async (...args: T): Promise<R> => {
    const user = await requireCurrentUser();
    return withAuthenticatedDatabaseContext(user, async () =>
      await withVerifiedRequest(user, async () => await handler(...args)));
  };
}

/** Public shells may render anonymously. Any signed-in branch receives the
 * same verified database scope as protected pages. */
export function withOptionalAuthenticatedPage<T extends unknown[], R>(handler: (...args: T) => Promise<R>) {
  return async (...args: T): Promise<R> => {
    const user = await getCurrentUser();
    return user
      ? withAuthenticatedDatabaseContext(user, async () => await withVerifiedRequest(user, async () => await handler(...args)))
      : withVerifiedRequest(null, async () => await handler(...args));
  };
}
