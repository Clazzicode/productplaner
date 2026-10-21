# Production operations

## Environment separation

- **Production:** Vercel Production uses Supabase project `hzsrdpbdbfqaicropsha`.
- **Staging:** Vercel Preview must use a separate Supabase branch/project and Preview-scoped environment variables.
- Preview and explicitly marked staging/test environments are now blocked automatically when Auth, `DATABASE_URL`, or an optional `DIRECT_URL` target production, cannot be verified, or target different projects. `ENFORCE_ENVIRONMENT_ISOLATION` no longer disables this protection. Middleware, API handlers, server Supabase clients, and scoped database operations enforce the check. `/api/ready` returns `503` without querying the unsafe database; `/api/health` remains available.
- The guard accepts standard Supabase project URLs, direct database hosts, and project-qualified Supavisor pooler usernames. Custom database proxies/domains require an explicit reviewed extension; unknown connections fail closed in non-production hosted environments. `PRODUCTION_SUPABASE_PROJECT_REF` may add a production project reference; it cannot remove protection for the original production project.
- This guard does not provision staging. Configure Preview variables against a separate database before expecting preview pages to work. Build success alone is not proof of isolation.
- Keep `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` scoped separately for Production and Preview.
- **Verified October 7, 2026:** the protected Production `/api/ready` response is `ready` with database and environment-isolation checks passing. The protected Preview response is intentionally `503 unavailable` because its Preview-scoped variables still target production Supabase. Provisioning a separate Preview database remains required.

### Staging migration workflow

- The application schema is Prisma-managed. Do not replay Prisma SQL through a second `supabase/migrations` ledger; that creates competing migration histories.
- `.github/workflows/staging-prisma-migrations.yml` is a manual-only workflow for applying the checked-in Prisma chain to the isolated staging project. It requires a GitHub `staging` environment and its secrets: `STAGING_DATABASE_URL` (runtime `app_rw` connection), `STAGING_DIRECT_URL` (migration-capable connection), `STAGING_APP_RW_PASSWORD` (32+ character base64url secret used to set the role password after migrations create the role), and `STAGING_SUPABASE_PROJECT_REF` (the exact 20-character staging project ref).
- Configure required reviewers on the GitHub `staging` environment. Never configure these secrets at repository scope or reuse production credentials. The workflow refuses missing/unknown refs, production refs, and mismatched database targets; after migration it checks the applied Prisma status, `app_rw` role, required tables, public-table RLS, and the private rate-limit table.
- Use a clean, independent staging Supabase project for this Prisma-only workflow, not a preview branch that automatically replays the production project's separate Supabase migration ledger. The migration-target guard explicitly rejects the currently failed branch ref.
- The currently inspected branch `staging` (`arpiicazvcfdcwigearj`) reports `MIGRATIONS_FAILED`; read-only checks show no application tables and no applied branch migrations. The production project's independent Supabase ledger contains six migrations, including rate-limit SQL that depends on `app_private`, while the checked-in Prisma chain creates that schema separately. Replaying both histories on the data-less branch is not a safe deployment path. Do not reset the branch or change production to work around it.
- A clean independent project, `Clarivia Staging` (`qbogvclmehvrtuwiktos`, `us-west-1`), has now been provisioned in the owner's Supabase organization at the explicitly approved $10/month quote. It is active but not yet migrated or connected to Vercel.
- Migration execution and deployed sign-in testing remain pending until GitHub's protected `staging` environment is configured with this project's scoped database credentials, and the manual workflow succeeds.

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
| Atlassian Forge remote | 120 per minute per client address |
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
## Durable background jobs

- Set `CRON_SECRET` in the production Vercel environment to a random value of at least 16 characters. Vercel sends it as `Authorization: Bearer <value>` to the configured cron endpoint.
- `BACKGROUND_WORKER_SECRET` may be set for a separately deployed worker; do not expose either value to the browser.
- The recovery cron calls `/api/internal/background-jobs/run` every minute. User-triggered plan generation also starts a post-response worker attempt, while the durable database row remains available for cron recovery after a crash or timeout.
- Alert on `BackgroundJob.status = 'dead_letter'`, jobs whose `availableAt` is old, repeated failed attempts, and a growing queued count.
- `/api/ready` intentionally returns 503 when worker authentication or the durable-job migration is absent.

## Atlassian Forge remote

- Set `FORGE_APP_ID` to the exact application ARI from the Atlassian developer console. The remote rejects requests when it is absent or does not match the Forge Invocation Token audience/app identity.
- `/api/atlassian/forge/installation` validates the invocation token signature through Atlassian's JWKS, requires the Forge issuer and expiry, rejects non-Atlassian API hosts, and records only installation identity. OAuth headers and invocation tokens are never logged or stored.
- Isolated Cloud fails closed until its Atlassian-provided JWKS and storage URL templates are configured. Do not weaken host validation to enable it.
- A newly observed installation is `pending_link` and has no organization access. Production Jira import/export must remain disabled until an authenticated organization administrator completes a one-time pairing flow and project/field/status mappings are approved.

## Atlassian OAuth connection

- Create one distributable OAuth 2.0 (3LO) app in the Atlassian developer console. Register the exact callback URL `/api/atlassian/oauth/callback` for each Clarivia deployment host and prefer a resource-level grant so the user selects only the Jira site being connected to this Clarivia workspace. The implementation uses the authorization-code grant, `prompt=consent`, `read:jira-work`, and `offline_access`; it requests no Jira write scope.
- Configure `ATLASSIAN_CLIENT_ID`, `ATLASSIAN_CLIENT_SECRET`, and `ATLASSIAN_OAUTH_REDIRECT_URI` as server-only Vercel environment variables for the relevant deployment environments. Never prefix these values with `NEXT_PUBLIC_`.
- For staging, scope the Vercel values to Preview deployments and use the independent `Clarivia Staging` Supabase project for every database/Auth variable. Register the exact stable staging callback URL in the Atlassian app. Do not paste OAuth secrets or database passwords into chat, source files, or build logs.
- Generate an independent 32-byte base64url `ATLASSIAN_TOKEN_ENCRYPTION_KEY` for each environment and store it as a Vercel secret. Keep it stable while any connections encrypted with it exist; key rotation requires decrypting and re-encrypting the stored token bundles before replacing the key.
- Workspace owners/admins manage the OAuth flow from Integrations. Callback state is high entropy, hashed in the database, bound to the initiating workspace/user, expires after ten minutes, and is consumed once. The access/rotating-refresh-token bundle is AES-256-GCM encrypted with workspace-bound associated data and stored only in `app_private."AtlassianOAuthConnection"`; tokens are not put in `IntegrationConnection.settingsJson`, audit metadata, or application logs.
- Workspace members may read the narrow status function's site/scope metadata; only workspace admins can read the encrypted credential row or manage the connection. Disconnect deletes Clarivia's local credential. Users can revoke Atlassian's authorization grant separately from their Atlassian account's Connected apps settings.
- The `Check permissions` action uses the supported accessible-resources endpoint and performs no Jira data writes. Rotating refresh tokens are refreshed under a row lock so concurrent requests cannot overwrite the newest token. A rejected/expired grant is shown as `Reconnect required`.
- Jira issue creation/updates and Jira webhook create/refresh/delete calls are additionally blocked server-side unless `JIRA_WRITE_ENABLED=true`. Keep this flag unset/false for the current read-only integration; UI controls also reflect that policy.
- The five high-severity advisories reported by the full `npm audit` on October 17, 2026 are confined to the ESLint development dependency chain (`braces` → `micromatch` → `fast-glob` → `@next/eslint-plugin-next`). `npm audit --omit=dev` reports zero production vulnerabilities. The offered automatic fix downgrades `eslint-config-next` across a major version and must not be applied blindly; track an upstream patched toolchain.
