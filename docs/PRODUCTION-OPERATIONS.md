# Production operations

## Environment separation

- **Production:** Vercel Production uses Supabase project `hzsrdpbdbfqaicropsha`.
- **Staging:** Vercel Preview must use a separate Supabase branch/project and Preview-scoped environment variables.
- Preview and explicitly marked staging/test environments are now blocked automatically when Auth, `DATABASE_URL`, or an optional `DIRECT_URL` target production, cannot be verified, or target different projects. `ENFORCE_ENVIRONMENT_ISOLATION` no longer disables this protection. Middleware, API handlers, server Supabase clients, and scoped database operations enforce the check. `/api/ready` returns `503` without querying the unsafe database; `/api/health` remains available.
- The guard accepts standard Supabase project URLs, direct database hosts, and project-qualified Supavisor pooler usernames. Custom database proxies/domains require an explicit reviewed extension; unknown connections fail closed in non-production hosted environments. `PRODUCTION_SUPABASE_PROJECT_REF` may add a production project reference; it cannot remove protection for the original production project.
- This guard does not provision staging. Configure Preview variables against a separate database before expecting preview pages to work. Build success alone is not proof of isolation.
- Keep `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` scoped separately for Production and Preview.

## Rate limits

Sensitive endpoints use an atomic Postgres-backed fixed window limiter in `app_private`. Current limits:

| Operation | Limit |
| --- | --- |
| Sign in | 10 per 10 minutes per client address |
| Sign up | 5 per hour per client address |
| Password reset email / password update | 5 per hour per client address, separately |
| AI actions | 30 per hour per client address |
| Document analysis | 10 per hour per client address |
| Document uploads | 20 per hour per client address |
| Plan generation/regeneration | 20 per hour per client address |
| Integration sync | 30 per 10 minutes per client address |
| Admin mutations | 60 per 10 minutes per client address |
| Account reset | 3 per hour per client address |

Set a secret `RATE_LIMIT_SALT` in Production and Preview to strengthen pseudonymization of client addresses. Rate limit records contain only SHA-256 hashes and expire through opportunistic cleanup.

## Monitoring and alerts

API failures emit structured JSON at error level with request ID, deployment environment, status, duration, and error type. They intentionally exclude request bodies, headers, URLs, tokens, and exception messages. Vercel Runtime Errors and Runtime Logs can group and search these events.

Create alerts for:

- `/api/ready` returning `503` twice within five minutes.
- Server error rate above 2% with at least 20 requests in one hour.
- Any sustained authentication `5xx` responses.

The owner confirmed an alert recipient on September 25, 2026; keep the address in the provider configuration, not source control. Provider authorization/configuration and a delivered test alert remain outstanding. Structured logging alone does not constitute connected error monitoring.

## Backups and restore validation

The Supabase organization is on Pro. Entitlement is not evidence of a usable backup: verify a recent scheduled backup appears, then restore it into an isolated non-production project. Record the backup timestamp, restore duration, row-count checks, schema validation, and application readiness result. Never test a restore in place against the production project. Backup inventory and an actual restore remain unverified.

## Email account rollout

New customer accounts use email/password through the public Supabase sign-up flow. Keep email confirmation and leaked-password protection enabled. App workspaces are provisioned after a confirmed session, with retries for concurrent provisioning. Names from user metadata are display text only; roles and membership still come from the database.

In each Supabase environment, set the correct Site URL and allow the exact application origin plus `/auth/callback` (including the password-recovery callback query). The standard Supabase confirmation/recovery templates must preserve `{{ .ConfirmationURL }}` so PKCE codes reach that callback. Open links in the browser where registration/recovery started. Cross-browser or expired links are rejected with recovery instructions. Do not allow a preview origin in the production Auth redirect list.

Before rollout, test delivered confirmation and password-reset emails with a controlled inbox: sign up, confirm, reach the new workspace, sign out, request recovery, set a different password, and sign in. This mail-delivery test has not been performed by the local unit suite. Supabase/Resend domain configuration and SMTP sender verification are separate acceptance checks.

The temporary product sender must be replaced with the intended product business address/name before inviting real users. Verify any new sending domain in Resend and test delivery.

Existing username accounts can still sign in through the explicit legacy option. No account IDs or planning data are rewritten. Those accounts need a controlled, ownership-verified email migration before email recovery is available. Do not assign addresses based on display names, auto-confirm unverified addresses, or create replacement accounts that orphan workspaces.

## Migration history reconciliation

On September 25, 2026, the live rate-limit function, table columns/defaults, constraints, and grants were compared with `20260922120000_request_rate_limits`. They matched the already-installed Supabase migration. `prisma migrate resolve --applied 20260922120000_request_rate_limits` repaired the missing Prisma ledger entry; `prisma migrate status` then reported all 35 migrations up to date. No schema or customer records were changed. Future deployments should use the checked-in Prisma migrations and avoid applying the same SQL independently through two ledgers.

## Retention and deletion

Customer-data and audit-event retention periods remain a business decision. Organization deletion must remain unavailable until the deletion policy, authorization ceremony, backup implications, and audit requirements are approved.
