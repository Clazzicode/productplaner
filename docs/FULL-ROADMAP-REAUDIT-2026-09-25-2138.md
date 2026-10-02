# Guided Planning - Full Roadmap Re-audit

Date: September 25, 2026, 9:38 PM EDT (America/New_York, UTC-04:00)

## Assessment

The remediation is published and passes the automated quality gates, but the production foundation is not yet ready to be signed off. Two additional integrity defects were reproduced in isolated code probes. Staging, recovery, alert delivery, customer-email delivery and deployed readiness still need acceptance evidence. This is not a verified 90%-complete product or a production-readiness certification.

PR #2 is an OPEN DRAFT and has not been merged. Its fixes must be distinguished from the current default branch and deployed application. No application code, production data, provider settings or migrations were changed during this re-audit. The only new local files are this report and audit evidence. No live Jira work was started.

## Exact scope and release evidence

| Item | Evidence | Meaning |
| --- | --- | --- |
| Audited remediation | 8405319a16aae89897aafc0b0a08e3c5ce2d2a13 | Branch fix/post-audit-hardening; tracked working tree clean. |
| GitHub default branch | master at 4cedbf766810b4b1c0aa5461f20a92fb2c9d364d | Read directly from GitHub; local master is stale and was not used as the release authority. |
| Draft PR | [PR #2](https://github.com/Clazzicode/productplaner/pull/2) | Published, open, unmerged, draft. |
| Exact-head CI | [Run 36208128810](https://github.com/Clazzicode/productplaner/actions/runs/36208128810) | Successful on the audited commit; all required build/test gates passed. |
| Preview deployment | GitHub deployment 6673067320, exact remediation head | Build succeeded. Readiness URL returns hosting-login HTML. |
| Latest GitHub Production record retrieved | Deployment 6661754310, commit 2a7984721a0923e26e7547b87c3d9bb5513ff18d | Successful recorded deployment; this is not proof of the current canonical-domain alias. |
| Master protection | Required verify check, strict/up-to-date, administrators enforced | PR required; force pushes and deletion disabled. Required reviewer count remains zero. |
| Supabase | productplaner, hzsrdpbdbfqaicropsha, ACTIVE_HEALTHY; organization Pro | Subscription and project state verified through the connection. |

Reviewed all 71 API route files for shared-wrapper coverage and inventoried authentication/guard call sites. All 71 use withApi. Detailed review covered session resolution, object guards, access administration, new email routes, environment enforcement, generation, locking, versioning, manual release/sprint writes, rate limiting, schema/migrations, CI, tests, integration stubs and operations documentation. A wrapper inventory is not proof of correct authorization on every path.

The review combines source inspection, fresh exact-head CI, a fresh local security suite, dependency scans, two isolated reproductions, live read-only database metadata/advisors and deployment probes. It does not include an independent penetration test, exhaustive browser/UI review, production load test, real-customer account migration, live-database fixture tests or a backup restore.

## Earlier findings: what changed

| Earlier issue | Current result | Qualification |
| --- | --- | --- |
| Preview guard only detected production use | Fixed and tested in PR | Fails closed before Auth/database use; checks Auth, runtime DB and optional direct DB project identity. Separate staging still needs provisioning/configuration. |
| Missing Prisma rate-limit migration entry | Fixed in live ledger | 35 completed migrations; the rate-limit migration is recorded. Earlier repair followed definition comparison; no new migration in this audit. |
| Placeholder customer signup / absent recovery | Implemented and tested in PR | Email/password signup, confirmation callback, recovery/reset and legacy sign-in are covered. Real email delivery and legacy-account transition remain acceptance gaps. |
| CI triggered on wrong default branch | Fixed in PR | Workflow covers master/main and PRs; exact-head run passes. Master protection is verified live. |
| Dependency advisory failures | Fixed in PR | Fresh full and production-only scans report zero known vulnerabilities. This does not mean all possible vulnerabilities are absent. |
| Missing operational evidence | Still open | Recovery, alerts, staging and deployed readiness are not verified. |
| Incomplete audit events / workflow tests | Still open | Newly inspected manual scheduling and ownership paths expose specific additional gaps below. |

## Findings requiring action

### A1 - P1: manual scheduling bypasses approved Waterfall protection

The manual sprint endpoint authorizes initiative editing, then creates a sprint and assigns stories without calling assertAgileLayerEditable. That helper explicitly prohibits sprint/release edits after approval for Waterfall. The standard move-sprint endpoint does call it. Manual release creation also bypasses the shared planning-mutation service.

An isolated probe executed the real sprint route against a database double representing an approved Waterfall plan. It returned HTTP 200, created a sprint, assigned a story, retained approvedAt and wrote zero audit events. Historical approved RoadmapVersion rows were not shown to mutate; the defect affects live schedule governance and traceability.

Evidence: src/app/api/releases/[releaseId]/sprints/route.ts:72; src/app/api/initiatives/[id]/releases/route.ts:65; src/lib/generation/engine.ts:50; src/app/api/artifacts/[artifactId]/move-sprint/route.ts:62; src/lib/generation/mutation.ts:6. Reproduction: docs/audit-evidence/approved-sprint-2026-09-25.cjs.

Required fix: use the established planning mutation/checkpoint/audit mechanism; apply the methodology guard inside the same transaction; preserve the existing flexible-sprint behavior for other methodologies. Acceptance: approved Waterfall rejects both manual paths without writes; permitted changes have the intended approval state, checkpoint and audit event; an injected failure rolls everything back.

### A2 - P2: simultaneous owner removals bypass the last-owner safeguard

changeGrantPermission and revokeGrant count other direct owners separately from the update/delete. These calls do not share a business transaction. Two requests can each see the other owner and both succeed.

A deterministic concurrent probe executed the real revokeGrant service with a database double. Both deletions returned ok and zero direct owners remained. Organization administrators retain implicit access, so this is a stored-ownership invariant failure, not demonstrated complete administrator lockout or cross-tenant access.

Evidence: src/lib/access/mutations.ts:100, :107 and :131; src/app/api/admin/access/grants/[grantId]/route.ts. Reproduction: docs/audit-evidence/owner-race-2026-09-25.cjs.

Required fix: serialize/recheck ownership within one transaction or lock the initiative while changing owners. Add concurrent revoke and downgrade tests, plus atomic reassignment if offered by the UI.

### A3 - P2: manual scheduling checks happen before their transaction

The release route checks whether a phase already has a manual release before entering its transaction. The schema makes prototype/order unique, not prototype/phase for manual releases. Two requests that finish preflight before either write, then enter their transactions sequentially, can use different order values and create duplicate phase releases. Serializable writes alone cannot protect reads already completed outside that transaction.

The sprint route similarly selects unassigned stories before its transaction, then updates by ID without checking sprintId is still null. A stale request can reassign a story claimed in the meantime. These are source-established race conditions; unlike A1/A2, this audit did not execute an end-to-end concurrency reproduction.

Evidence: release route:44 and :65; sprint route:51, :72 and :90; prisma/schema.prisma:715 and :734. Required fix: move business preconditions inside the transaction, use conditional writes and verify affected counts, and add a database uniqueness rule where justified. Acceptance: concurrent phase claims and story assignment cannot duplicate or silently overwrite one another.

### A4 - P1 release gate: deployed operation and recovery remain unverified

Only the default main branch was returned for the inspected Supabase project; the accessible project inventory did not identify an active product staging project. The fail-closed code protects against misconfiguration but does not create a usable staging environment.

Both the exact-head preview and the latest recorded production deployment returned HTTP 200 with text/html and the title Login - Vercel at /api/ready. That is a hosting login response, not successful application readiness. The connected Vercel account returns an authorization error for the project, limiting environment, alias, log and alert inspection. This is an audit-access limitation, not evidence of an application outage.

Pro entitlement is confirmed, but a recent usable backup and an isolated restore drill were not verified. No connected error-monitoring instrumentation was found in source, and external monitoring/alert delivery could not be verified. An alert recipient has already been chosen; that decision does not need to be repeated.

Acceptance: identify the production commit/domain; configure isolated staging; verify actual JSON readiness through an authorized monitor; confirm scheduled backups; restore into an isolated target; validate schema, data and readiness; deliver a test outage/error alert to the designated recipient. Preserve production while testing recovery.

### A5 - P1 release gate: account lifecycle needs deployed delivery tests

New signup and recovery code uses email/password and verified Supabase identities. Tests cover unconfirmed users, duplicate-email responses, malicious callback redirects, expired/invalid callbacks, recovery and legacy username sign-in. They mock the email provider.

Complete a real signup-confirmation-login-recovery-reset journey with the actual deployment and provider redirect configuration. Existing username accounts need an intentional verified-email transition and recovery path. The security advisor no longer reports leaked-password protection as a warning, but this audit did not verify rejection through the real signup flow. Do not count provider configuration or mocked tests as delivered-email proof.

### A6 - P2: audit coverage and integrity testing remain incomplete

Planning audit helpers and immutable AuditEvent records exist, but user/role updates, access grants, project changes and the manual scheduling paths do not consistently write business audit records. See src/app/api/admin/users/[userId]/route.ts:93, src/lib/access/mutations.ts and src/app/api/projects/[id]/route.ts.

Existing tests prove nested transaction composition and PostgreSQL rollback/immutability using disposable PGlite. They do not inject failures through every real move/regeneration/lock/manual scheduling service. Live RLS fixture tests are opt-in and excluded from the default CI run. No deployed browser acceptance suite is in CI.

Acceptance: record actor, organization, action, entity, change metadata and correlation ID for material administration/scheduling changes. Add targeted real-service failure and concurrency tests, then a staging multi-tenant browser journey. Do not log credentials or document contents.

### A7 - P2: throttle cleanup and database performance need bounded work

The durable rate limiter is present and covers sensitive operations. Its migration labels cleanup bounded, but the SQL deletes every bucket older than 48 hours on a subset of requests; there is no row batch limit or leading time index for that cleanup. At scale this can add work to sign-in and other sensitive requests. Deployed 429 behavior and trusted proxy-address handling remain unverified. Evidence: prisma/migrations/20260922120000_request_rate_limits/migration.sql:59.

Fresh Supabase performance advisors report 16 auth/RLS init-plan warnings, 51 unindexed-foreign-key information findings, five unused-index information findings and one Auth-connection allocation information finding. These are tuning signals, not measured outages. Assess plans and realistic workload before adding all indexes or dropping any index. Fix per-row auth evaluation where safe, benchmark tenant queries, and bound or schedule cleanup.

References: [RLS init-plan guidance](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan), [foreign-key indexes](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Production-foundation requirements scorecard

Status distinguishes implementation from production acceptance. A passing unit test is not marked as deployed verification.

| Requirement | Status | Remaining acceptance |
| --- | --- | --- |
| Assessment and route inventory | Reviewed | Targeted deep review, not exhaustive penetration certification. |
| Session identity / demo replacement | Implemented, tested | No demo identity references found in runtime source search. Complete real account journey. |
| Shared tenant object authorization | Implemented, tested foundation | Foreign project/artifact/capability/regeneration/approval tests pass; exercise deployed multi-tenant journey. |
| Owner/admin/member roles | Implemented, partial lifecycle | Fix A2; complete invitation/ownership transition behavior as required. |
| RLS and restricted database role | Live metadata verified; migration tests pass | app_rw is neither superuser nor BYPASSRLS. Live fixture suite not run. |
| Atomic movement / regeneration | Implemented, partially verified | Expand real-service failure injection; A1/A3 are gaps outside main engine. |
| Atomic locking / approval / baseline | Implemented, partially verified | Transactions and immutable history exist; full layer-lock UI intentionally disabled. |
| Durable version history | Implemented foundation | Checkpoints, approved/superseded history, author/time and comparison exist; full restore is not implemented. |
| Immutable approval records | Implemented, tested | Compatibility serialized baseline remains; A1 does not show immutable history changing. |
| Audit events | Partial | A1/A6; administration and scheduling coverage. |
| Database hardening | Partial | Decimal money fields and tenant/parent constraints exist; remaining string statuses/serialized JSON need selective review. |
| Jira demo containment | Implemented | Both demo paths require development mode plus explicit flag; no live Jira synchronization. |
| Runtime, dependency and code gates | Pass on PR | Node 24 range; schema, typecheck, strict lint, tests, production build and advisory audit pass. |
| CI and branch protection | Verified, PR still unmerged | Merge through protected workflow only after review; deployed release verification still needed. |
| Logs and correlation | Implemented | Common wrapper and sanitized logs; external monitoring and delivered alerts unverified. |
| Health / readiness | Implemented, local prior pass | Deployed checks blocked by hosting authentication, A4. |
| Distributed rate limiting | Implemented, partial verification | A7; deployed limits and cleanup behavior under load. |
| Staging, backups and restore | Not verified complete | Isolated staging and a recorded restore drill. |
| Retention, deletion and operations | Documented, incomplete | Approve retention periods and organization deletion policy; validate rotation and incident procedures. |

Live database notes: 35 completed Prisma migrations are recorded. All inspected public business tables have RLS; the only public table returned without RLS is _prisma_migrations. Reviewed private helpers have empty fixed search paths and restricted execution grants. The security advisor has one informational RLS-without-policy finding on platform_admins, consistent with deny-by-default access. Do not add a permissive policy merely to clear that notice. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Entire product roadmap

| Milestone | Current position | Completion gate |
| --- | --- | --- |
| 0. Product/integration boundaries | Partial | Finalize field ownership, approval meaning, Jira directionality/conflict handling and actual compliance commitments. Current roles and planning methodology provide a foundation. |
| 1. Production foundation | Substantial implementation; acceptance incomplete | Resolve A1-A6 as applicable, demonstrate staging/health/auth/restore/alerts, then finish targeted operational hardening. |
| 2. Jira Export MVP | Deferred; interface groundwork only | Canonical integration model, tenant-scoped OAuth/site identity, secure token lifecycle, metadata discovery, payload mapping, durable jobs, idempotency, retry and per-item outcomes. Demonstrate export/retry/recovery in a test Jira project. |
| 3. Closed-loop delivery | Mostly deferred | Authenticated/deduplicated webhook inbox, status/sprint/release import, cursors, stale-data visibility, conflict resolution and replay/reconciliation. Local baseline metrics are only groundwork. |
| 4. Enterprise readiness | Mostly deferred; shared access/admin groundwork | Prioritize SSO/SCIM, retention/deletion, availability objectives, disaster recovery, portable data export, assurance and support tooling against actual customer commitments. Marketplace distribution is optional future scope. |

The older sync/jiraStub.ts and newer sync/integrationStub.ts remain demo implementations. The integrations hub is a useful starting point, not a finished production connector. AI job status bookkeeping is not a durable background worker. No live Jira HTTP integration, resilient export pipeline or closed-loop delivery implementation was established by this review.

The recommended next milestone remains foundation closure. Jira Export MVP follows once critical security/integrity and operational acceptance gates are verified. Do not represent screenshots, connected-looking demo badges or future enterprise features as completed behavior. No defensible weighted completion percentage exists until the acceptance checklist and milestone weights are agreed.

## Practical closure order

1. Repair manual scheduling governance and move its preconditions into the transaction; add rollback and concurrency regression tests.
2. Make owner changes atomic and expand material administration/scheduling audit events.
3. Review PR #2 and publish the final verified remediation through the protected branch workflow. It has not been merged by this audit.
4. Restore Vercel project access, configure isolated staging and verify the intended deployment's JSON readiness.
5. Complete actual signup/confirmation/recovery, a multi-tenant planning journey, rate-limit checks and a delivered monitoring alert.
6. Confirm production backup inventory, complete an isolated restore and record recovery results. Approve retention/deletion policies and operational ownership.
7. Measure and address database/throttle performance; finalize the integration contract before beginning Jira Export MVP.

## Verification results

| Check | Result | Evidence / limits |
| --- | --- | --- |
| Clean dependency install | PASS | Exact-head GitHub CI npm ci, including Prisma generation. |
| Prisma schema validation | PASS | Exact-head CI. |
| Typecheck | PASS | Exact-head CI. |
| Lint | PASS, zero warnings allowed | Exact-head CI uses --max-warnings=0. |
| Full test suite | PASS, 71 files / 581 tests | Fresh exact-head CI, completed September 25 at 9:22 PM EDT. |
| Targeted security suite | PASS, 10 files / 95 tests | Fresh local run at 9:35 PM EDT; default exclusion of live fixture tests remains. |
| Production build | PASS | Exact-head CI; Vercel preview build also successful. |
| Dependency audit | PASS, zero known vulnerabilities | Fresh full and --omit=dev scans; high-severity gate now blocking in CI. |
| Migration replay / rollback / immutable history | PASS within suite | Disposable PGlite, not a live Supabase failure-injection drill. |
| Live migration metadata | PASS | 35 completed entries; expected rate-limit migration recorded. |
| Two new audit probes | DEFECTS REPRODUCED | Approved-sprint and concurrent-owner behavior demonstrated with real source and database doubles; no live writes. |
| Deployed readiness | UNVERIFIED | Preview and recorded production URLs return Vercel login HTML. |
| Live signup/recovery, alert delivery, backup restore | NOT VERIFIED | No test emails, alerts or restores performed in this audit. |

The unchanged full quality gates were taken from the fresh CI run on the exact audited commit rather than redundantly rebuilding the same source locally. New focused security checks and reproductions were run locally. Successful probes of defects are not additional passing product regression tests.

Source evidence is local to the audited repository. New audit scripts and the route inventory are under docs/audit-evidence; they have not been committed or pushed. Earlier reports are preserved for comparison. No new migrations were created.

