import { AsyncLocalStorage } from "node:async_hooks";
import type { CurrentUser } from "./session";

const verifiedRequest = new AsyncLocalStorage<{ user: CurrentUser | null }>();
export const currentVerifiedRequest = () => verifiedRequest.getStore();

/** Called only after session verification by an entry-point wrapper. */
export async function withVerifiedRequest<T>(user: CurrentUser | null, fn: () => Promise<T>): Promise<T> {
  return verifiedRequest.run({ user }, async () => await fn());
}
