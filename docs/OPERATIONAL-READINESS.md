# Operational readiness

## Implemented here

- Every API route uses one wrapper for a correlation ID, structured completion/failure logs, cross-origin mutation rejection, no-store responses and sanitized unexpected errors.
- `/api/health` reports process health without dependencies. `/api/ready` checks database connectivity, the non-bypass `app_rw` role and required production tables.
- Demo integrations require both development mode and `ENABLE_DEMO_INTEGRATIONS=true`. Settings are restricted to known boolean simulator switches. No credential or token enters either fake sync path.
- CI pins Node, validates Prisma, typechecks, lints with zero warnings, runs tests, builds, and uploads a non-blocking dependency advisory report.

## Required before production traffic

- Apply and verify the four new migrations in a staging Supabase branch before production. Confirm the runtime `DATABASE_URL` connects as `app_rw`; readiness deliberately fails for `postgres`, `service_role`, or another RLS-bypassing role.
- Put rate limiting at the edge/API gateway with a durable shared counter. Cover sign-in, sign-up, document analysis and AI generation first. A process-memory limiter is unsuitable for horizontally scaled/serverless deployment.
- Enable managed point-in-time recovery or daily encrypted backups. Define retention, run a restore into an isolated environment at least quarterly, and record recovery time/data-loss results.
- Store secrets only in the deployment secret manager; rotate Supabase service credentials and AI provider credentials on a schedule and after staff/access changes.
- Define tenant export, retention and verified cascading deletion. Audit/approval retention may need a different legal period than working planning data.
- Maintain separate development, staging and production Supabase/Vercel environments. Production must keep `ENABLE_DEMO_INTEGRATIONS` unset.
- Connect structured logs to one monitoring/error provider, add alerts for readiness failures, elevated 5xx/409 rates, auth failures, database saturation and AI budget exhaustion.
- Add a documented incident response and disaster recovery runbook with owners and escalation paths.

Feature flags should live in a centrally managed, auditable provider before adding user-visible production rollouts. The environment gate used for demo integrations is deliberately narrow and is not a general flag system.
