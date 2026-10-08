# Production readiness recheck — 2026-09-22

## Conclusion

Not everything in the supplied original review is complete. The core production-foundation implementation is present and the focused security checks pass. External operations remain unfinished. Live Jira and enterprise features were intentionally deferred by the user's production-foundation instructions.

Reviewed commit: `2a7984721a0923e26e7547b87c3d9bb5513ff18d`, branch `v2-redesign`. PR #1 is OPEN, targets `master`, and is not merged. GitHub quality gates and Vercel preview deployment passed on this exact commit. This is not proof that the latest code is deployed to production.

This is a status review, not a new exhaustive penetration test. No application code or service configuration was changed in this recheck.

## Original findings compared with current evidence

| Original finding | Current status | Evidence / remaining limit |
| --- | --- | --- |
| Implicit demo identity | Addressed in application | `src/lib/auth/session.ts` verifies Supabase identity using `getUser()`, resolves an active internal user and active organization membership, and fails closed when membership is absent. |
| Missing tenant/object authorization | Core controls implemented and tested | Shared project/initiative/document/AI access checks, organization roles, and transaction-local RLS identity exist. The focused suite passes 75 tests, including foreign-ID route rejection and disposable database isolation checks. This does not certify every possible route and input. |
| Missing database tenant protection | Implemented for inspected objects | Live metadata confirms RLS on RoadmapVersion, PlanApproval and AuditEvent. The `app_rw` role has neither superuser nor BYPASSRLS privileges. |
| Non-atomic movement/regeneration | Addressed for identified workflows | Phase movement, generation and downstream regeneration use `withTransaction`; the database wrapper joins nested operations and uses serializable isolation. Failure/rollback tests pass. |
| Non-atomic locking/baselines | Addressed for identified workflows | Locking, approval/version persistence and audit use transactions; migration tests cover rollback when approval persistence fails. |
| Destructive regeneration without history | History foundation implemented | Working-plan snapshots are archived in RoadmapVersion; PlanApproval and AuditEvent are first-class records with database immutability triggers. A complete restore/rollback workflow is still deferred. |
| Permissive persistence | Partially hardened by design | Monetary values use Decimal; history/audit constraints, parent/tenant checks and indexes exist. Many legacy structured fields, including version snapshots, remain JSON serialized into text. External Jira identity mappings are not implemented. |
| Lint/test/runtime failures | Previous failures repaired | Node is pinned to 24.x; exact-commit typecheck, strict lint, tests, schema validation and production build passed earlier in this session and in PR CI. The focused 75-test security suite passed again during this review. |
| Dependency vulnerabilities | Reduced, not eliminated | Fresh audit reports 3 high findings, 0 critical, affecting prisma -> @prisma/config -> deepmerge-ts. `npm audit --omit=dev` reports the same 3; `npm ls --omit=dev` includes this chain through @prisma/client's Prisma peer. No direct app source import of @prisma/config or deepmerge-ts was found. Runtime reachability/bundle exclusion must not be inferred solely from devDependencies placement. |
| Missing CI | Implemented with gaps | PR checks pass; migration replay runs in PGlite. Push trigger lists `main`, although this PR targets `master`. Live database integration tests require RUN_LIVE_DB_TESTS=true and are excluded by default. Security audit uploads are non-blocking. No full browser end-to-end suite or authenticated deployed readiness check is established. |
| Unsafe Jira synchronization | Contained, not implemented for production | Both stubs require development mode plus ENABLE_DEMO_INTEGRATIONS=true. Both models remain; the old sequential fake-key loop remains inside the disabled production path. OAuth, real export, mappings, retries, jobs and webhooks are future work. |

## Operational checklist

| Item | Status as verified today |
| --- | --- |
| Supabase Pro | Confirmed by connected organization API. |
| Leaked-password protection setting | Enabled: live security advisor no longer reports the warning. End-to-end rejection through the app's custom admin-based signup flow was not tested. |
| Durable API rate limiting | Code is in the PR, database function exists live, and unit/database checks were performed earlier. Live deployed HTTP 429 behavior remains unverified behind Vercel authentication. This is application-level throttling, not a configured Vercel firewall rule. |
| Structured logs / correlation | Implemented, including error-level output and request IDs. |
| Monitoring and alerts | Incomplete: no configured recipient, tested delivery, or verified external alert rule. Structured logs alone are not a connected alerting system. |
| Health and readiness routes | Implemented. Deployed readiness result is unverified; earlier probes reached Vercel login. Current Vercel connector still returns no accessible teams. |
| Production backups | Pro entitlement confirmed. Supabase documents automatic daily backups on Pro, but this project's actual backup inventory/timestamps have not been inspected. Do not mark backup verification complete. |
| Restore test | Not performed or recorded. A fresh empty branch is not evidence of a successful backup restore. Use a supported isolated restore destination and validate recovered data, roles and application readiness. |
| Staging/production separation | Incomplete. Connected Supabase branch list contains only production main. No staging branch was created; recurring cost approval remains pending. Preview environment variables are unverified. |
| Retention / organization deletion | Decisions pending; no implemented retention purge or organization deletion/recovery workflow was found in the reviewed scope. |
| Secrets rotation / incident recovery | Expectations documented; executed rotation, recovery objectives, incident ownership and recovery drill evidence are not established. |
| Feature flags | Development-only integration flag exists. A managed rollout flag system is deferred. |
| Durable background execution | AI job records exist, but production Jira workers, retry queues and recovery handling are not implemented. |

## Corrections to earlier completion claims

1. **Environment protection is detection only.** `assertEnvironmentIsolation()` is defined in `src/lib/environment.ts` but never called. Only `/api/ready` uses the detector; other requests are not blocked by ENFORCE_ENVIRONMENT_ISOLATION. The detector checks NEXT_PUBLIC_SUPABASE_URL, not the actual DATABASE_URL, so it does not prove database separation.
2. **The dependency audit is not clean, including with dev dependencies omitted.** The earlier development-only classification needs the peer dependency and deployed-bundle qualification above.
3. **Preview deployment success is not production readiness.** PR #1 remains open and deployed `/api/ready` has not returned a verified application JSON response.
4. **Pro eligibility is not a verified backup or restore.** The backup inventory and a successful isolated restore still need evidence.
5. **Old reports are historical.** The September 18 reports still list password protection and rate limiting as missing; those entries are superseded by this recheck. Their live database test counts are historical, not newly repeated live tests today.

## Intentional later milestones in the supplied review

- Product ownership matrix, Jira directionality/conflict rules and compliance target need explicit decisions before the integration milestone; this recheck does not treat the supplied recommendation as a finalized specification.
- Jira Export MVP: canonical integration model, OAuth lifecycle, site/project/field discovery, durable export jobs, remote mappings, idempotency, retries, partial-failure handling and activity screen.
- Closed-loop delivery: webhook validation/deduplication, sprint/status/actuals import, stale-data detection, conflict resolution and resynchronization.
- Enterprise readiness: SSO/SCIM, further permissions, retention controls, formal security review, availability objectives, disaster recovery, Marketplace/Forge and support tooling.

Live Jira remains deferred as instructed; its absence is not a regression in the production-foundation work.

## Verification evidence

- Fresh focused security run: 8 test files, 75 tests passed. Includes all-migration replay in disposable PGlite; excludes the live integration file by default.
- Same-commit full validation earlier today: 67 files, 543 tests; typecheck, zero-warning lint, Prisma validation and production build passed. Not rerun unnecessarily for unchanged application code.
- Exact-head GitHub quality gate: SUCCESS; Vercel preview: SUCCESS; Supabase Preview: SKIPPED.
- Fresh dependency audit: 3 high, 0 critical; same result with --omit=dev.
- Fresh Supabase security advisor: only informational RLS-without-policy finding on platform_admins; no leaked-password warning. Do not add a permissive policy merely to remove this informational deny-by-default finding.
- Fresh live metadata: inspected history tables have RLS; app_rw does not bypass RLS; private rate-limit function exists. The private rate-limit counter uses restricted grants/function access rather than tenant-table RLS.

References: [PR #1](https://github.com/Clazzicode/productplaner/pull/1), [CI run](https://github.com/Clazzicode/productplaner/actions/runs/35786921931), [Supabase backups](https://supabase.com/docs/guides/platform/backups), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [RLS-without-policy advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Recommended order

Fix the environment-enforcement and CI branch gaps; resolve or accurately accept remaining dependency risk. Then establish authorized staging, verify backup/restore, connect and test alerts, verify production deployment/readiness, and settle retention/deletion and incident ownership. Reassess production readiness on that evidence before making a launch claim. Keep Jira development as a separately scoped milestone.
