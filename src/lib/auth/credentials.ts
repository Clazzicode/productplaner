import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.")
  .max(254).refine((email) => !email.endsWith(".invalid"), "Use an email address that can receive mail.");
export const passwordSchema = z.string().min(8, "Password must be at least 8 characters.").max(128);

/** Only fixed local destinations; never accept a caller-supplied redirect URL. */
export function authCallbackUrl(request: Request, recovery = false): string {
  const url = new URL("/auth/callback", request.url);
  if (recovery) url.searchParams.set("next", "/reset-password");
  return url.toString();
}
