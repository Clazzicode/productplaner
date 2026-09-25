import { z } from "zod";

/**
 * Legacy sign-in compatibility only. Existing prototype accounts retain their
 * auth IDs and workspaces. New registrations must use verified real email;
 * never use this mapping to create or pre-confirm a new customer account.
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
