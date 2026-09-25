# Production operations

## Environment separation

- **Production:** Vercel Production uses Supabase project `hzsrdpbdbfqaicropsha`.
- **Staging:** Vercel Preview must use a separate Supabase branch/project and Preview-scoped environment variables.
- Set `ENFORCE_ENVIRONMENT_ISOLATION=true` in Preview after the staging database is connected. `/api/ready` returns `503` whenever a Preview deployment points at production.
- Keep `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` scoped separately for Production and Preview.

## Rate limits

Sensitive endpoints use an atomic Postgres-backed fixed window limiter in `app_private`. Current limits:

| Operation | Limit |
| --- | --- |
| Sign in | 10 per 10 minutes per client address |
| Sign up | 5 per hour per client address |
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

Alert recipients are intentionally not configured until an operational owner and escalation destination are selected.

## Backups and restore validation

The current Supabase Free plan does not provide managed daily backups. Before production launch, upgrade to Pro or higher, verify the scheduled backup appears, and restore the latest backup into an isolated non-production project. Record the backup timestamp, restore duration, row-count checks, schema validation, and application readiness result. Never test a restore in place against the production project.

## Retention and deletion

Customer-data and audit-event retention periods remain a business decision. Organization deletion must remain unavailable until the deletion policy, authorization ceremony, backup implications, and audit requirements are approved.
