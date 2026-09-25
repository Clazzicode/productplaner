import { z } from "zod";

/**
 * Temporary simplified auth: username + password only, no real email. Supabase
 * Auth's admin.createUser()/signInWithPassword() are email-based, so a
 * username is mapped to a deterministic, non-routable placeholder address
 * under Supabase Auth itself — everything downstream (sessions, RLS via
 * auth.uid(), establishAuthContext) keeps working unchanged, and the user
 * never sees or enters a real email. ".invalid" is the IANA-reserved TLD for
 * exactly this — guaranteed to never resolve or accidentally deliver anywhere
 * real.
 *
 * Revisit this (and the Admin API account creation it pairs with in
 * src/app/api/auth/sign-up/route.ts) once real email sign-up is ready.
 */

export const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;

export const usernameSchema = z
  .string()
  .trim()
  .regex(USERNAME_REGEX, "Username must be 3-30 characters: letters, numbers, dots, underscores, or hyphens.");

const PLACEHOLDER_EMAIL_DOMAIN = "local.invalid";

/** Lowercased so "JohnDoe" and "johndoe" resolve to the same account,
 * matching how usernames are typically treated as case-insensitive. */
export function usernameToPlaceholderEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}
