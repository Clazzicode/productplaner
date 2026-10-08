import { z } from "zod";

/** Usernames are case-insensitive credentials; their original case is display-only. */

export const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;

export const usernameSchema = z
  .string()
  .trim()
  .regex(USERNAME_REGEX, "Username must be 3-30 characters: letters, numbers, dots, underscores, or hyphens.");

const PLACEHOLDER_EMAIL_DOMAIN = "local.invalid";

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Lowercased so "JohnDoe" and "johndoe" resolve to the same account,
 * matching how usernames are typically treated as case-insensitive. */
export function usernameToPlaceholderEmail(username: string): string {
  return `${normalizeUsername(username)}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}
