# Guided Planning - full roadmap audit

Date: September 25, 2026

## Outcome

The production foundation is substantially implemented in the reviewed branch, with passing local quality checks and meaningful security/integrity tests. Its production deployment and operational controls are not yet verified. Live Jira export, closed-loop delivery synchronization, and most enterprise capabilities remain future work.

The earlier 70-80% foundation and 25-35% whole-roadmap figures were rough planning estimates, not measured acceptance-criteria completion or remaining engineering effort. This audit replaces percentage-based confidence with the evidence and milestone gates below. Passing tests and implementing controls do not establish production readiness on their own.

## Scope and evidence boundary

- Requirements source: all five pages of `C:/Users/avery/Downloads/Avery Code Review.pdf`, including its findings and Phases 0-4. Its recommendations were treated as audit criteria, not authorization to implement Jira or alter service settings.
- Repository: `Clazzicode/productplaner`, local branch `v2-redesign`, commit `2a7984721a0923e26e7547b87c3d9bb5513ff18d`.
- Fresh GitHub check: [PR #1](https://github.com/Clazzicode/productplaner/pull/1) remains open and unmerged, targeting `master`, with that same head SHA. PR metadata and older reports contain historical counts and outstanding-item lists.
- Fresh code inspection: authentication, common access helpers, database context/transactions, representative sensitive routes, planning mutation/history services, integration stubs, schema, migrations, operations documents, CI, test configuration, and relevant tests.
- Inventory: 69 API route files; all reference `withApi`. The 64 files outside sign-in, sign-up, sign-out, health and readiness contain the shared authentication guard and explicit database authentication context. This is a static file-level inventory, not proof of every handler's authorization semantics.
- Fresh Supabase checks: subscription, branch list, security advisors, table RLS metadata, application database role, private functions, Prisma migration history and Supabase migration history. No customer row contents were needed.
- Fresh local verification: full tests, typecheck, strict lint, schema validation, build and dependency audits. Logs are in `docs/audit-evidence/2026-09-25/`.
- Limitations: no complete browser journey, penetration test, load test, authenticated deployed smoke test, backup restore, or new live database write test. Live integration tests are excluded by default. No application code, database state, deployment, email settings, or Jira configuration was changed.

Status meanings: **Implemented/tested** means inspected source plus relevant local evidence; **Partial** means usable pieces exist but the criterion is incomplete; **Unverified** means operational evidence is unavailable; **Deferred** means the roadmap capability has not been implemented for production in this repository.

## Findings requiring attention

### F1 - High: preview environment protection does not enforce isolation

`src/lib/environment.ts:36` defines `assertEnvironmentIsolation`, but repository search finds no caller. `/api/ready` uses `environmentIsolation()` only. Other application requests can proceed even when readiness reports a preview/production conflict. Detection examines `NEXT_PUBLIC_SUPABASE_URL`, not the actual Prisma `DATABASE_URL`; inconsistent public and server configuration can pass this check.

Fresh Supabase branch inventory contains only default `main`. This establishes no staging branch for the inspected project; it does not prove there is no unrelated staging project elsewhere. Vercel environment values remain inaccessible.

**Acceptance:** establish a separate staging database/auth environment; validate both server database and authentication destinations; enforce checks before application reads/writes; test deliberate misconfiguration and a successful staging request.

### F2 - High: live schema and Prisma migration history disagree

There are 35 local Prisma migration directories. Live `_prisma_migrations` contains 34 completed, non-rolled-back entries, ending at `20260918134000_restrict_rls_helpers`.

The live rate-limit objects exist, and Supabase migration history records `20260922211646 request_rate_limits`. Prisma does not record local migration `20260922120000_request_rate_limits`. Its SQL uses unconditional `CREATE TABLE app_private.rate_limit_bucket` and `CREATE FUNCTION app_private.check_rate_limit`.

**Impact:** a subsequent Prisma migration deployment can attempt to recreate existing objects and fail. Clean-database migration replay passes, so it cannot detect this already-applied-production mismatch.

**Acceptance:** compare the actual deployed definitions with the checked-in migration; reconcile the Prisma ledger using the supported migration-resolution workflow only after equivalence is verified; validate both a fresh database and the existing-database deployment path. Do not drop live objects to make the migration pass. No reconciliation was performed in this audit.

### F3 - High: customer email verification/recovery is unfinished

`src/lib/auth/username.ts` maps usernames to `@local.invalid`. `src/app/api/auth/sign-up/route.ts` calls the Supabase admin API with `email_confirm: true`, deliberately bypassing the confirmation email pipeline. No application password-reset flow was found. Sign-in can provision a missing application workspace after an interrupted signup, but this is not email recovery.

**Impact:** functioning password login and configured SMTP do not give customers verified, recoverable email accounts. The leaked-password advisor warning is absent, but rejection through this custom signup path was not tested.

**Acceptance:** choose email login or usernames plus verified real email; migrate existing accounts safely; implement and exercise verification and recovery; test password policy on the actual application flow. Before real-user onboarding, replace the temporary `nextgendepot.online` sender with the intended product business address/name, verify its domain in Resend if different, and test delivery. No settings were changed.

### F4 - High release gate: production recovery, alerting and deployed health lack evidence

Supabase Pro is confirmed. Actual backup inventory and timestamps, a successful isolated restore, alert configuration/delivery, and production environment variables could not be verified through the available access. Vercel returns an empty team list and a 403 for `averylovings-projects`, explicitly requiring authentication to that scope.

Fresh GET requests to the previously known preview and production deployment URLs reached Vercel login HTML. The final HTTP 200 belongs to the login page; it is not a successful `/api/ready` response. These known URLs do not prove the identity of today's current production alias.

**Acceptance:** verify the intended production commit/domain; obtain healthy readiness JSON through authorized access; perform deployed smoke tests; inspect backup timestamps; restore in isolation and validate recovered data; trigger a controlled error and receive its alert. An open PR is not proof that the code is absent from every deployment, nor proof of production release.

### F5 - Medium: default-branch CI trigger mismatch

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`; the reviewed PR targets `master`. A direct or merged push to `master` does not match that push trigger. The same-head [PR quality-gate run](https://github.com/Clazzicode/productplaner/actions/runs/35786921931) is successful.

**Acceptance:** align CI with the actual release branch; verify a run on that branch; establish the intended required checks and deployed health verification. Branch-protection configuration was not verified.

### F6 - Medium pending reachability assessment: dependency audit still fails

Fresh full and `--omit=dev` audits each report **3 high, 0 critical** package findings. They are one advisory propagated through `prisma -> @prisma/config -> deepmerge-ts`, not three independently identified exploits. The advisory is [recursive-object stack exhaustion in DeepmergeTS](https://github.com/advisories/GHSA-ggr8-5vv4-36mx). Installed `deepmerge-ts` is 7.1.5. The production dependency tree includes the chain through `@prisma/client`'s Prisma peer.

No direct application source use of `deepmerge-ts` or `@prisma/config` was identified. This does not prove deployed-bundle exclusion or runtime unreachability. npm proposes Prisma 6.12.0 as a semver-major remediation path; it was not applied blindly. CI uploads audit results but does not fail on them.

**Acceptance:** validate a compatible remediation, or document concrete reachability analysis, owner, rationale and review date for temporary acceptance. Do not label the production audit clean.

### F7 - Medium: audit coverage and workflow tests need expansion

Planning movement, generation, approval, locking, generic planning mutations and initiative AI application have audit hooks. The inspected administrator user-change route and project-update route have no business audit write. They therefore do not establish an enterprise security administration trail.

The test suite has useful foreign-ID route tests, transaction-composition tests and PostgreSQL migration/rollback/immutability tests. SQL-level rollback tests and a mocked transaction wrapper are not complete failure-injection tests through every real move/lock service. A deployed browser journey is absent from CI.

**Acceptance:** add audit events for material permission/member changes and agreed project/governance actions; add focused real-service failure tests and a small deployed customer journey. Preserve secret and document-content exclusions.

## Phase 0 - Product boundaries

| Requirement | Status | Evidence and remaining work |
| --- | --- | --- |
| Platform/Jira ownership matrix | Partial | PDF proposes a clear division; no finalized integration contract found in repository docs. Confirm ownership per field/entity. |
| Customer roles | Implemented/tested for foundation | Organization owner/admin/member roles, team membership, initiative view/edit/owner grants and role tests exist. |
| Approval workflow | Partial | Direct admin/owner plan approval is implemented. Per-layer locking service exists, but the approve route documents that the full layer-lock ceremony is disabled by product decision. Confirm the intended user workflow. |
| Jira directionality | Deferred decision | Demo behavior is one-way. Real export/import responsibilities are not settled in an executable contract. |
| Conflict rules | Deferred decision | Intake context conflict handling exists; that is not a platform/Jira shared-field conflict policy. |
| Compliance target | Unverified | No approved target, data classification or associated acceptance criteria found. |

**Exit gate:** agree on a concise field-ownership, approval and integration contract, plus the applicable compliance scope. Enterprise controls should follow actual customer requirements.

## Phase 1 - Production foundation

| Requirement | Status | Evidence and remaining work |
| --- | --- | --- |
| Session-derived identity | Implemented/tested | `auth/session.ts` verifies Supabase `getUser()`, resolves active internal user and active organization membership. Demo identity is not the runtime identity. |
| Application object authorization | Implemented/tested for inspected paths | Shared project/initiative/document guards and explicit role checks; foreign project/artifact/capability/regeneration/approval route rejection tests pass. Not an exhaustive route-by-route penetration certification. |
| Database tenant isolation | Implemented/tested foundation | Live application tables have RLS; `app_rw` has neither superuser nor BYPASSRLS. Migration replay tests exercise cross-tenant rejection. |
| Privileged function containment | Implemented for inspected helpers | Private-schema functions have fixed empty search paths; restricted helper and Data API grants exist in migrations. Public tenant table access is routed through the application. |
| Role enforcement | Implemented/tested | Owner/admin/member gates; last-owner and identity protection; admin project/approval controls. Complete member invitation/ownership-transfer lifecycle is not established. |
| Atomic movement/regeneration | Implemented, testing partial | Services share serializable transactions and nested delegates. Composition and database rollback tests pass; service-level failure injection remains narrower than the full workflow. |
| Atomic locking/baseline/approval | Implemented, testing partial | Lock/baseline/approval/audit use transactions and immutable history. SQL rollback test passes; full layer-lock UI is deliberately disabled. |
| Durable plan versions | Implemented/tested foundation | Working checkpoints, approved/superseded versions, author/time fields, history endpoint and comparison endpoint exist. Current plan remains the working `Prototype`; not every edit is a separately addressable current-version row. |
| Immutable approval/baseline records | Implemented/tested | `PlanApproval`, `RoadmapVersion`, database immutability triggers and isolation tests. Compatibility baseline string still exists. |
| Version comparison/restore | Partial | Basic snapshot comparison and tests exist. Full restore/rollback operation and its user flow were not found. |
| Audit trail | Partial | Reusable `auditInitiative`, immutable `AuditEvent`, request IDs and activity page. Administration/security-event coverage is incomplete (F7). |
| Database hardening | Partial | Monetary Decimal fields, parent/tenant checks, indexes and uniqueness constraints implemented. Many structured fields remain serialized text and many domain fields are strings. Inspect individually before converting; money precision is not the same concern as nonmonetary Float values. |
| Real email account lifecycle | Partial | Real authenticated sessions work; placeholder email signup remains (F3). SMTP delivery and recovery are unverified. |
| Leaked-password protection | Setting evidence present | Fresh security advisor no longer reports the warning. Actual custom signup rejection remains untested. |
| Rate limiting | Partial | Shared Postgres fixed-window counter exists live; sensitive mutation routes have policies. Deployed 429 behavior, trusted client-address handling and salt configuration are unverified. Cleanup is described as bounded but deletes all old rows without a batch limit/index on time; assess under load. |
| Structured logs/request correlation | Implemented | Shared `withApi`, generated request IDs, allowlisted structured fields and consistent generic errors. Early cross-origin rejection lacks the common response headers/log completion path. |
| Monitoring, metrics, tracing, alerts | Partial/unverified | Structured logs exist. No provider instrumentation found in source; external platform alert configuration and delivery not verified. |
| Health/readiness | Partial | Routes build successfully. Live readiness cannot be confirmed behind hosting authentication (F4). |
| Staging/production separation | Incomplete | F1; only default branch returned for the inspected Supabase project. |
| Backup/restore | Unverified | Pro confirmed; no backup inventory or completed restore evidence. |
| Retention/deletion/secrets/incident operations | Documented only | Expectations exist, but approved policies, purge/delete workflows, rotation evidence and recovery drill are absent/unverified. Account start-over is not a tenant deletion policy. |
| Feature flags | Partial | Demo integrations require both development mode and explicit flag. No managed rollout/kill-switch program found. |
| Dependable test harness | Implemented, coverage partial | 543 tests pass; disposable PostgreSQL migration tests exist. Live integration tests opt-in; no full browser CI suite. |
| Runtime/type/lint/build gates | Implemented/tested | Node 24.15.0 and all fresh local checks pass. |
| Dependency security gate | Partial | F6; audit remains nonblocking with three high package findings. |
| CI/deployment controls | Partial | PR CI passes; default-branch trigger, migration ledger and deployed verification gaps remain (F2/F4/F5). |
| Durable background workers | Deferred | `src/lib/ai/job.ts` records job status; it is not a durable dispatch/retry/recovery worker. No production Jira worker implementation found. |
| Jira stub containment | Implemented | Both demo paths require `NODE_ENV=development` and `ENABLE_DEMO_INTEGRATIONS=true`; settings allowlist prevents accepting arbitrary credentials. Legacy sequential fake-key behavior remains only within the demo path. |

**RLS qualification:** live `platform_admins` is RLS-enabled without policies, reported only as informational; this is consistent with denying ordinary access. Do not add permissive policies merely to silence the [advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). `_prisma_migrations` and the private rate-limit counter are not tenant business tables; their security depends on restricted grants. Public application table RLS metadata alone does not prove every policy correct.

**Exit gate:** resolve F1-F6 or explicitly accept qualified risks; complete customer auth lifecycle; demonstrate deployed tenant isolation, integrity, rate limiting, alert delivery and recovery. The existing green local checks are necessary but insufficient.

## Phase 2 - Jira Export MVP

The integration hub, connection forms, fake mappings and sync logs provide interface groundwork only. No live Jira HTTP client, OAuth grant model or production export job was found.

| Requirement | Status | Acceptance requirement |
| --- | --- | --- |
| One canonical integration model | Partial groundwork | Consolidate current `SyncConnection` and `IntegrationConnection` behind one supported path; migrate/deprecate demo state safely. |
| OAuth installation/site identity | Deferred | Tenant-scoped authorization, callback validation, site selection, permission checks and installation identity. |
| Credential lifecycle | Deferred | Encrypted tokens, refresh concurrency handling, expiry/revocation/disconnect behavior and secret-safe logs. |
| Site/project discovery | Deferred | Load authorized remote choices and reject unauthorized project selection. |
| Issue-type/field metadata mapping | Deferred | Discover and validate remote required/custom fields and issue types. Demo form labels do not satisfy this. |
| Jira payloads and descriptions | Deferred | Map local epic/story hierarchy and descriptions into supported remote payloads. Verify against current Atlassian documentation when implementing. |
| Durable export jobs/per-item results | Deferred | Survive worker/process interruption and expose item-level outcomes. AI job bookkeeping is insufficient. |
| External identity mappings | Deferred | Persist installation/site/project/local artifact/remote IDs and payload fingerprints with uniqueness constraints. A nullable `externalRef` does not meet this. |
| Idempotent creation | Deferred | Repeat exports and retry after an uncertain response without duplicating remote issues. |
| Rate limits/retries/partial failure | Deferred | Backoff, retry classification, remote throttling, resumability and failed-item recovery. |
| Real sync activity/audit | Partial UI groundwork | Replace demo log messages with actual job/item state and audited publish actions. |

Older `src/lib/sync/jiraStub.ts` serves the legacy initiative Jira flow. Newer `integrationStub.ts` serves the integrations hub; it is the stronger organizational starting point, but its demo implementation is not a production canonical design. Neither should be enabled as a shortcut to live integration.

**Exit gate:** in a Jira test project, connect, discover, map and export an approved plan; retry without duplicates; inject a partial failure and recover; demonstrate tenant/remote permission isolation and credential revocation. No live Jira implementation was started.

## Phase 3 - Closed-loop delivery

| Requirement | Status | Acceptance requirement |
| --- | --- | --- |
| Webhook registration/lifecycle | Deferred | Register supported events, maintain required subscriptions and handle disconnects. |
| Webhook authentication/inbox/deduplication | Deferred | Validate incoming events with the mechanism supported by the chosen integration; reject invalid requests; persist and deduplicate deliveries. |
| Sprint/status/release/actuals import | Deferred | Map remote execution records to authorized local objects and retain source provenance. |
| Plan-versus-delivery variance | Partial local groundwork | Local plan/baseline health exists; remote delivery reality is not ingested. |
| Cursors/stale-data detection | Deferred | Persist synchronization position and show reliable last-updated/stale states after outages. |
| Shared-field conflict resolution | Deferred | Apply agreed ownership rules; record and review conflicts without overwriting protected planning decisions. |
| Resynchronization/replay tooling | Deferred | Recover from gaps, duplicates and out-of-order events without corruption or duplicate work. |

**Exit gate:** remote changes update the right tenant's delivery view, duplicates/out-of-order events are safe, stale status is visible, conflicts require the agreed resolution, and a forced interruption can be recovered.

## Phase 4 - Enterprise readiness

| Requirement | Status | Evidence and remaining work |
| --- | --- | --- |
| SSO | Deferred | No application SSO flow found. Supabase platform capability is not configured product behavior. |
| SCIM/provisioning | Deferred | No provisioning/deprovisioning integration found. |
| Granular permissions | Partial | Team and individual initiative grants exist. Enterprise policy scope, administration and lifecycle acceptance remain undefined. |
| Retention/deletion controls | Deferred | Business decision and safe implementation required, including immutable approval/audit and backup implications. |
| Formal security review | Partial groundwork | This source/configuration review and automated isolation tests exist. Independent penetration testing and formal assurance evidence are not established. |
| Availability objectives | Deferred decision | No agreed service objectives, escalation ownership or demonstrated alert program. |
| Disaster recovery | Unverified | No recorded recovery drill, recovery time/data-loss objective validation or tested incident runbook. |
| Import/export | Partial | Document intake and printable executive reports exist; complete portable tenant data export/import and validation are not established. |
| Marketplace/Forge presence | Deferred | No Forge manifest/application or marketplace implementation found. Conditional future distribution milestone, not a foundation requirement. |
| Operational support tooling | Partial | Admin users/teams/access, activity and AI usage views exist; customer support diagnostics, recovery workflows and incident handling remain incomplete. |

**Exit gate:** agree which enterprise commitments are actually sold; validate each through customer-relevant acceptance tests and operating evidence. Do not build every enterprise capability merely to increase a percentage.

## Fresh verification results

| Check | Result on September 25 |
| --- | --- |
| Node/runtime | 24.15.0; matches package engine range |
| Full tests | PASS - 67 files, 543 tests |
| Typecheck | PASS |
| Lint | PASS with `--max-warnings=0` |
| Prisma schema validation | PASS |
| Production build | PASS - Next.js 16.3.5 |
| Migration replay / security tests | PASS as part of full suite; disposable PGlite plus mocked route/service tests |
| Live RLS integration tests | NOT RUN in this audit; excluded unless explicitly enabled |
| Fresh dependency audit | FAIL - 3 high package findings, 0 critical |
| Audit omitting dev dependencies | FAIL - same 3 high package findings |
| Live migration ledger consistency | FAIL - 35 local, 34 Prisma entries; rate-limit migration recorded separately by Supabase |
| GitHub same-head PR CI | SUCCESS; historical run result re-read today |
| Supabase subscription | Pro confirmed |
| Supabase security advisor | One informational deny-by-default table finding; no leaked-password warning |
| Deployed readiness | UNVERIFIED - known deployment URLs lead to hosting login HTML |
| Backup restore / alert delivery / browser E2E | NOT VERIFIED |

An initial network-restricted advisory request failed; the authorized retry succeeded and produced the results above. No dependency installation or upgrades were performed. Existing installation tests and build passed; locked clean install is evidenced by the successful same-head CI rather than a new local `npm ci`.

## Recommended execution order and ownership

1. **Foundation code/release repair:** environment enforcement, migration-ledger reconciliation, actual-branch CI, dependency remediation/reachability, targeted tests. Engineering work; ledger changes require verifying deployed definitions first.
2. **Account lifecycle:** decide email versus username-plus-email, then implement/test verification, recovery and existing-account transition. Product sender remains temporary until its final business identity exists.
3. **Operations verification:** restore Vercel team access, confirm staging resource cost before provisioning, separate environments, inspect backups and restore in isolation, select alert recipient and test delivery.
4. **Production acceptance:** verify release commit/domain and healthy readiness; run a small authenticated, multi-tenant deployed journey covering generation, editing, approval and history; verify throttling without disruptive traffic.
5. **Product/integration contract:** finalize Phase 0 decisions, then authorize Jira Export MVP as a separate milestone after critical foundation gates pass.
6. **Closed-loop delivery:** implement only after export/mapping/recovery behavior is reliable.
7. **Enterprise:** prioritize against customer and compliance commitments rather than an arbitrary completion target.

User decisions/access still needed: Vercel authentication for `averylovings-projects`; staging cost approval after a current quote; alert recipient/escalation owner; customer/audit retention periods; organization deletion policy; real-email account experience; product sending identity; Jira ownership/conflict contract and compliance target.

No implementation permission is being requested by this report. It records audit findings and concrete acceptance gates. The next engineering milestone remains foundation closure; the next integration milestone is Jira Export MVP once those gates are verified.
