# Production Foundation Compliance Matrix

Checked against the complete production-foundation specification on 2026-09-18.

| Phase | Status | Evidence and limits |
| --- | --- | --- |
| 1. Repository assessment | Complete | `PRODUCTION-FOUNDATION-ASSESSMENT.md` records the clean-checkout assessment, route inventory, existing controls, gaps and affected files. |
| 2. Authentication context | Complete | Supabase `getUser()` is mapped to the internal user and an active organization membership. Missing membership and invalid roles fail closed. No production demo identity is used. |
| 3. Tenant authorization | Complete | Shared organization-role and initiative/object guards protect tenant reads and writes. Exact foreign IDs are rejected independently of RLS. |
| 4. Database tenant isolation | Complete | RLS, active membership, bootstrap, owner preservation, parent consistency, direct Data API denial and restricted helper execution are verified against disposable and live PostgreSQL. |
| 5. Transaction safety | Complete for identified critical workflows | Phase movement/regeneration, locking/baseline/approval, assumptions/repacking and recalculation use serializable transaction scope with rollback tests. External AI/API calls remain outside long database transactions. |
| 6. Versioned planning model | Complete foundation | `Prototype` remains the current working plan and immutable `RoadmapVersion` rows preserve preceding drafts and approved snapshots. The schema supports later restore/diff work; a restore UI was intentionally not built. |
| 7. Baseline and approval model | Complete | `PlanApproval` links organization, project, initiative, approved version, approver, status, metadata and timestamp. Approved history is immutable. |
| 8. Audit events | Complete for core planning actions | Reusable transactional audit writes cover planning changes, moves, regeneration, locks/unlocks and approval. No credentials or document bodies are logged. Jira publication audit remains part of the future Jira milestone. |
| 9. Database hardening | Complete for production-foundation invariants | Currency uses decimal types; approval/audit metadata uses JSONB; tenant and parent checks, status checks, uniqueness and tenant-query indexes were added. Supabase still reports lower-priority legacy foreign-key indexing opportunities. |
| 10. Jira stub containment | Complete | Both legacy and current stubs are documented and require development mode plus `ENABLE_DEMO_INTEGRATIONS=true`. No live Jira calls or credential path was added. |
| 11. Quality gates | Complete | Deterministic install, exact framework/test updates, strict lint, typecheck, tests, schema validation and production build pass. Remaining Prisma CLI advisory is development-only and documented. |
| 12. Risk-focused tests | Complete to requested scope | Authentication, cross-tenant reads/writes, role authorization, transaction rollback and immutable approval/audit history are covered. Complete application coverage was intentionally outside scope. |
| 13. CI | Complete | Pull requests run install, schema validation, typecheck, zero-warning lint, tests, build and advisory artifact upload. PR #1's first quality-gate job passed. |
| 14. Observability foundation | Complete in application | API routes emit structured request logs and correlation IDs, sanitize unexpected errors, and expose health/readiness endpoints. An external log/alert provider is not configured. |
| 15. Operational readiness | Documented; external controls remain | Edge rate limiting, backup/PITR and restore drills, secrets rotation, retention/deletion, environment separation, managed feature flags, monitoring/alerts and incident/DR ownership require platform configuration and operating procedures. |

## Priority status

- **P0:** Complete and verified.
- **P1:** Complete and verified for the critical integrity scope in the specification.
- **P2 application foundation:** Complete.
- **P2 external operations:** Partially complete; the remaining controls are listed above and in `OPERATIONAL-READINESS.md`.

## Current verification

- Connected Supabase schema: 34 migrations applied and current.
- Live database suite: 66 files, 545 tests passed.
- Focused security suite: 8 files, 75 tests passed.
- Typecheck, strict lint, Prisma validation, deterministic install and Next.js 16.3.5 production build: passed.
- Vercel preview for commit `5aab3e9`: `READY`.
- GitHub Actions pull-request quality gate: passed.
- Protected planning files `documentUnderstanding.ts` and `analyzeIntake.ts`: unchanged.
