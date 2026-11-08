import { timingSafeEqual } from "node:crypto";

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isAuthorizedWorkerRequest(request: Request, secrets: Array<string | undefined>): boolean {
  const authorization = request.headers.get("authorization");
  const presented = authorization?.startsWith("Bearer ") ? authorization.slice(7) : request.headers.get("x-worker-secret");
  if (!presented) return false;
  return secrets.some((secret) => Boolean(secret) && safeEqual(presented, secret!));
}

