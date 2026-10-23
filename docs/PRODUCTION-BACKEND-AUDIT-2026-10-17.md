# Production Backend Audit — 2026-10-17

## Scope

This audit compares the current `feat/stakeholder-matrix` checkout with the twelve-milestone production backend plan. It evaluates source code, Prisma schema and migrations, API boundaries, tests, CI, security controls, background work, Jira integration, and performance-readiness evidence.

The separate `feature-14-clarification` worktree and the two pre-existing untracked October 8 planning documents were not modified.

## Executive result

The application has a credible modular-monolith foundation and should be hardened incrementally rather than rewritten. Authentication, organization membership, database-enforced tenant isolation, request correlation, high-risk rate limiting, plan snapshots, audit records, and a broad product-domain schema are already present.

It is not production-ready yet. The release-blocking gaps are:

1. expensive AI and planning work still runs inside user HTTP requests;
2. Jira is represented by two demo-only connection models and performs no authenticated Atlassian network traffic;
3. no durable outbox/job claim, lease, attempt, retry, or dead-letter mechanism exists;
4. global browser security headers and CSP are not configured;
5. current restore, alert, incident, capacity, and deployed-readiness evidence is missing;
6. the current local test run is blocked by a Windows sandbox temporary-file restriction;
7. dependency advisory status could not be refreshed because the npm registry was unreachable from the sandbox;
8. product features 14 and 16–20 still need end-to-end completion evidence, while feature 21 remains a stub.

## Baseline verification

| Check | Result | Evidence |
| --- | --- | --- |
| Prisma schema validation | Pass | `npm run schema:validate` |
| TypeScript/Next route types | Pass | `npm run typecheck` |
| ESLint, zero warnings | Pass | `npm run lint -- --max-warnings=0` |
| Unit tests | Environment-blocked | Vitest could not rename its cache files under the Windows sandbox temp directory; zero tests executed |
| Runtime dependency audit | Environment-blocked | npm advisory endpoint failed DNS resolution |
| Production build | Pending first implementation iteration | Must run after schema/client generation and code changes |

The repository currently contains approximately 100 API route files and 874 test declarations. Every inventoried API route exports through `withApi`, which centralizes request IDs, cross-origin mutation rejection, rate limiting, no-store responses, and safe error shaping.

## Milestone assessment

### Milestone 1 — Environment and release isolation: partially implemented

Implemented:

- non-production deployments fail closed when Auth and database project references cannot be verified;
- CI validates schema, types, lint, tests, build, and dependency advisories;
- health and readiness endpoints exist;
- production database access expects the non-superuser, non-`BYPASSRLS` `app_rw` role.

Missing proof or work:

- independent staging project and staging deployment evidence;
- migration approval and rollback drill;
- deployed `/api/ready` verification;
- current dependency advisory report;
- branch-protection and release-approval evidence.

### Milestone 2 — Identity, authorization, and tenant isolation: strong foundation, audit closure required

Implemented:

- Supabase Auth identity verification;
- multi-organization membership and active-organization resolution;
- organization and initiative authorization guards;
- transaction-local JWT claims for Prisma queries;
- 65 RLS enablement statements and 124 policy declarations across migrations;
- cross-tenant and authorization-focused tests.

Remaining:

- run RLS tests against the current migrated database;
- run database security/performance advisors;
- inventory every current table against RLS, grants, and indexed policy predicates;
- prove session revocation and privileged-user MFA operationally.

### Milestone 3 — Data protection, immutable versions, and recovery: partially implemented

Implemented:

- immutable roadmap versions and approval evidence;
- audit events with request IDs;
- approved-baseline regeneration protection;
- database triggers protecting approval/history data;
- monetary columns use fixed-precision database types.

Remaining:

- approve a caller-specified exact version/fingerprint rather than generating and approving a snapshot as one opaque action;
- replace demo reset hard deletion with a production retention/archive policy;
- document data classification and Jira end-user-data handling;
- perform and record an isolated backup restore drill;
- keep currency alongside monetary amounts and avoid lossy JavaScript-number calculation paths.

### Milestone 4 — Breach prevention, detection, and containment: partially implemented

Implemented:

- same-origin enforcement for state-changing API requests;
- database-backed limits on authentication, AI, document, integration, admin, and destructive operations;
- allowlisted structured logs without request bodies, URLs, tokens, or raw errors;
- environment isolation and safe API error shaping.

Missing:

- CSP, HSTS, clickjacking, MIME-sniffing, referrer, and permissions-policy headers;
- tested alert delivery and anomaly thresholds;
- organization/integration kill switches;
- incident and credential-rotation drills;
- current penetration test and DAST evidence.

### Milestone 5 — Durable jobs and transactional outbox: not implemented

`AiJob` is status bookkeeping only. It has no atomic claim, lease, heartbeat, attempt ledger, retry schedule, idempotency contract, or dead-letter state. Planning, AI, document analysis, and Jira demo synchronization still execute in the initiating request.

This is the first major implementation dependency for reliable Jira and responsive user requests.

### Milestones 6–10 — Jira app, mappings, import, publish, and reconciliation: not implemented

Current Jira behavior is explicitly demo-only:

- no Forge application;
- no Forge Invocation Token verification;
- no Atlassian installation/site model;
- no OAuth/app-token lifecycle;
- no webhook/event inbox;
- no issue, field, type, or status mappings;
- no import cursors or external execution snapshots;
- no idempotent approved-plan publication;
- no conflict/reconciliation workflow;
- two overlapping demo connection models remain.

The target should be a Forge application using Forge Remote to call the existing Next.js backend. Clarivia owns approved planning baselines; Jira owns execution state after publication; conflicts require an explicit decision.

### Milestone 11 — Product feature completion: partially implemented

Features 1–13 and 15 have substantial model, route, service, and UI foundations. The October 8 percentage audit predates later merged workflow work and must not be used as the current completion percentage.

Feature 14 is being developed in a separate worktree. Features 16–20 still need implementation and end-to-end acceptance evidence. Feature 21 is the Jira work described above.

Each feature still needs the production Definition of Done: authorization/RLS, validation, auditability, concurrency behavior, failure states, accessibility, telemetry, automated tests, and a performance budget.

### Milestone 12 — Performance and 20-user capacity: not proven

Positive foundations:

- serverless-compatible Supabase pooler support is represented in environment validation;
- high-cost operations are identifiable;
- relevant organization and domain indexes exist in many models;
- API responses are not accidentally cached.

Missing:

- production-like p50/p95/p99 baseline;
- slow-query and N+1 inventory;
- foreign-key/index coverage report;
- queue isolation for expensive work;
- sustained 20-concurrent-user test with higher spike headroom;
- measured database connection, error-rate, and queue-depth thresholds.

## Ordered implementation

1. Add global security headers/CSP and regression tests.
2. Add a durable Postgres job/outbox schema with least-privilege RLS, atomic claim, lease recovery, attempts, idempotency, and dead-letter behavior.
3. Add a worker execution boundary and status API; move plan generation first, then AI/document work.
4. Tighten exact-version approval and establish publication eligibility.
5. Replace the two Jira demo connection models with a canonical installation/mapping model.
6. Add Forge Remote authentication and installation lifecycle.
7. Add Jira import, then approved publication, then event reconciliation.
8. Complete remaining product features without bypassing the common Definition of Done.
9. Add performance instrumentation, load tests, restore/incident drills, and formal launch gates.

## Audit conclusion

The safest implementation path is to keep the Next.js modular monolith and Supabase/Postgres system of record. The immediate architectural seam is a durable database-backed job/outbox layer. That layer removes slow external work from user requests and becomes the reliability boundary for AI, document processing, and all Jira communication.

## Implementation record — first production-hardening iteration

Completed after the audit:

- global nonce-based CSP and defensive browser headers with regression tests;
- durable Postgres jobs, attempt ledger, transactional outbox, webhook inbox, atomic `SKIP LOCKED` claims, leases, retry/backoff, idempotency, and dead-letter state;
- authenticated cron/worker boundary plus readiness checks and one-minute recovery schedule;
- plan generation and recalculation changed to `202 Accepted` durable jobs with client status polling and a post-response fast path;
- approvals now bind to the SHA-256 fingerprint of the exact plan the approver reviewed, with immutable approval/version evidence;
- canonical Atlassian Forge installation identity and a remote endpoint that verifies Atlassian JWKS signature, app audience, issuer, expiry, installation context, and commercial API host before the narrow database upsert;
- production runtime dependency audit: zero known vulnerabilities (`npm audit --omit=dev`); five high advisories remain in the development-only ESLint glob chain and have no safe non-breaking automatic fix at this time.

Verification after the implementation:

| Check | Result |
| --- | --- |
| Prisma format, validate, and client generation | Pass |
| TypeScript and generated Next route types | Pass |
| ESLint with zero warnings | Pass |
| Full Vitest suite | Pass — 99 files, 732 tests |
| Full migration replay in PostgreSQL-compatible PGlite | Pass — includes RLS, worker claim/complete, and Forge installation boundary |
| Production Next build | Pass with webpack; the sandboxed Turbopack process launcher failed due host process restrictions rather than application compilation |

This iteration materially advances milestones 3–6 but does not finish the twelve-milestone program. Jira organization pairing, project/field/status mappings, import, approved publication, webhooks/reconciliation, the remaining product features, deployed staging/restore/incident proof, and the 20-user load test remain release gates.

## Implementation record — Forge pairing and discovery iteration — 2026-10-18

Added in the current iteration:

- one-time, expiring organization pairing codes stored only as SHA-256 hashes, consumed atomically against a verified Forge installation;
- organization-scoped Jira project bindings and issue-type, field, status, and work-item mapping tables, with database checks for organization/initiative consistency and administrator-only mapping writes;
- administrator pairing-code and initiative mapping endpoints, plus signed-Forge-only pairing and project/metadata discovery endpoints;
- explicit Forge Remote ingress handling: only opted-in `/api/atlassian/forge/*` routes may bypass the browser Origin comparison, and middleware skips Supabase cookie refresh only for that route prefix. Every handler still verifies Forge's signed invocation before acting;
- a bounded Jira REST client that uses the verified Atlassian API host, short-lived Forge OAuth headers, no redirects, an 8-second timeout, safe response schemas, and a 2 MB streaming response cap;
- regression tests for foreign-origin rejection boundaries, middleware behavior, installation pairing/mapping isolation, and Jira upstream host/response-size controls.

Verification on October 18, 2026:

| Check | Result |
| --- | --- |
| Full test suite | Pass — 99 files, 735 tests; serial execution with workspace-local temp directory required by this Windows sandbox |
| ESLint | Pass — zero warnings |
| TypeScript and Next route type generation | Pass |
| Production build | Pass with `next build --webpack` when run with permission to write generated `.next` files; Turbopack could not spawn its CSS worker in this environment |
| Prisma migration replay / RLS tests | Pass within the full test suite, including pairing and mapping checks |

This does **not** establish 95% production readiness. The implemented Jira slice is installation pairing, configuration, and metadata discovery only. The backend still has no safe Jira issue import, approved-plan publication, webhooks, or conflict reconciliation. Creating those paths safely requires an explicit data ownership/field policy and a deployable Forge app that supplies the signed invocation and user/system OAuth context; never persist Forge OAuth tokens in a background job. Additionally, the code has not been deployed against an isolated staging database or a Jira test tenant. Production readiness also still needs verified alerts, backup restore, incident/credential rotation drills, and a measured 20-concurrent-user load test. These are release gates, not inferred from local test coverage.

## Implementation record — read-only Jira status refresh — 2026-10-18

Added a status-refresh endpoint that is deliberately read-only with respect to Jira:

- the backend uses Jira's enhanced JQL issue-search endpoint with HTTP `GET`, and requests only the `status` and `updated` fields;
- it can read no more than 50 existing mapped issue keys per request; it does not accept arbitrary JQL or issue keys from the caller;
- a database function revalidates the active Forge installation, cloud, and enabled project binding, and updates only local Jira status snapshot columns for issue IDs already mapped to artifacts in that binding;
- snapshots include a stable hash, mapped local status, Jira update timestamp, and sync time; repeated refreshes are idempotent, and refreshes are audit-recorded;
- Jira OAuth headers are used only for the current request and are not persisted. Tests use mocked HTTP responses and PGlite migrations; no live Jira calls or Jira write requests were made.

This is status synchronization, not Jira issue import or plan publication. It does not create Clarivia artifacts from Jira, mutate Jira, process webhooks, or resolve two-way conflicts. It is also not yet connected to a shipped Forge UI/manifest, and has not been exercised against an isolated Jira test site.

Verification for this increment: 100 Vitest files / 740 tests pass; ESLint passes with zero warnings; Prisma validation/client generation and Next route type generation pass; and the Webpack production build passes. Build output includes `/api/atlassian/forge/sync-status`. No operation was made against the connected Jira account; Jira network behavior was validated with mocked GET responses only.
