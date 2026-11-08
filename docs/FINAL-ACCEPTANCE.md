# Final acceptance — milestone 9

## Reporting boundaries

Implementation, production deployment and acceptance evidence are separate. The execution ledger maps the eight findings to nine milestones. CI and database replay cannot establish a 24-hour observation or prove hosted-provider acceptance.

## Existing-resource monitoring

`worker-monitor.yml` checks public readiness every five minutes using the existing public repository's standard GitHub runner. GitHub scheduling can be delayed; this is not a real-time paging SLA. No paid monitor or log drain is provisioned. Incidents are delivered as repository issues with delivery receipts in run summaries/artifacts. Email/mobile delivery depends on the repository owner's GitHub notification settings and is not claimed.

Thresholds: two consecutive failed cycles; a missing/stale required worker (15-minute readiness limit); terminal job failure. Duplicate incidents are deduplicated; current-state alerts close after recovery, terminal-job incidents require review. Only operational counts/times/status appear in public issues and readiness. No credentials, source content or job IDs are published.

Each scheduled cycle records immutable private evidence: start/end, outcome, duration, stage/error code and counts. Failed cycles with no returned counts report unknown, not a previous cycle's counts. Terminal failure signals survive successful idle cycles. Records expire after 30 days. History is tagged with the application release commit.

The readiness observation summary becomes `coverageComplete` only after at least 24 hours for the current release, with recent successes, at least 96 cycles, no gaps beyond 15 minutes, no failed cycles or terminal jobs in the window. This is coverage evidence for review, not an automatic declaration that all operational requirements passed. Later code releases begin a new observation identity.

## One final workload

The final acceptance workflow runs after merging a same-repository PR labeled `run-final-acceptance`, or by manual dispatch. It waits for the production release identity before starting the workload. It uses existing protected staging database secrets plus `STAGING_SUPABASE_SECRET_KEY` to create 21 synthetic Auth accounts without sending email or using a customer's password.

Twenty accounts exercise the same workspace concurrently; an isolated account checks cross-workspace denial. Owners/admins/editors/viewers and an external/admin combination sign in with real Supabase sessions. The production-mode Next.js server runs in the isolated runner against staging Auth/Postgres. This measures application/database latency; it does not measure hosted Vercel cold starts or geographic network latency to that deployment.

For 30 minutes, active sessions read every 10 seconds and eligible editors update their own canonical feature approximately once a minute. Acceptance: read p95 <=2 seconds; ordinary write p95 <=3 seconds; unexpected server errors <1%; no lost/duplicate writes or tenant leakage. Then repeated enqueue requests must produce three jobs, complete within five minutes, and leave the live planning hierarchy intact while creating reviewed proposals.

Accounts from this run only are disabled and removed from Supabase Auth. Non-owner memberships are revoked; disabled synthetic owner rows and planning/audit evidence remain in clearly retired test workspaces to respect immutable history/last-owner safeguards. No existing account or workspace is rewritten. Passwords/sessions remain in memory and are not uploaded.

## AI evidence

Affected deterministic tests cover provider outage, timeout, exhausted budget, usage/failure recording, request-lock release and stale suggestions. Real authenticated HTTP checks use explicitly synthetic proposals to test Use, Edit, Dismiss and stale-source rejection, with AI disabled and zero paid provider calls. Canonical feature projections are preserved and approved plans must be reopened before a feature proposal is accepted. A successful paid provider call is not implied by these checks.

## Restore exercise

The source is restricted to independent staging. One exported repeatable-read snapshot supplies schema/data and counts. Public, private and Auth schemas restore into a disposable runner PostgreSQL database. Evidence records backup hash/size/snapshot identity, duration, schema/RLS equality, counts, canonical relationships and non-bypassing application-database readiness. The private dump is never an artifact and is deleted after successful verification; the runner is disposable on failure.

This proves the database restore scope. Hosted Supabase Auth service configuration, external OAuth grants and storage binaries are outside the exercise. Production data is not dumped or changed by it.

## Pending external proof

The staging Auth key is required for the 20-user flow. GitHub alert receipts, restore and workload artifacts must exist before acceptance is reported. The 24-hour worker window must actually elapse after the final release. Production Jira authorization remains deferred by Avery; read-only staging Jira acceptance and production connection capability remain separate.
