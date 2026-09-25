# Production foundation assessment

Assessment performed against the clean local checkout of Clazzicode/productplaner on 2026-09-18, before implementation.

## Existing foundation

- Next.js 16.2.12, React 19, Prisma 6, PostgreSQL/Supabase; real cookie-backed Supabase `getUser()` authentication mapped through `User.authUserId`.
- `src/lib/auth/session.ts` already supplies page/API guards and resolves active organization membership. No runtime implicit demo user remains. Demo mentions are comments, integration simulators, reset UI, and the one-off `scripts/backfill-auth.ts`.
- Shared initiative/team grants, project access, document/context access and AI item guards exist in `src/lib/access/` and `src/lib/ai/assist/itemAccess.ts`. Preserve those product permissions.
- `src/lib/db.ts` establishes transaction-local JWT claims for app_rw. RLS migrations and real database isolation tests exist. API checks must still protect connections independently of RLS.
- `RoadmapVersion` already archives approved snapshots. Reuse it instead of adding a duplicate Plan hierarchy. `Prototype` remains the current working plan.
- AI governance, budget controls and pure planning engine tests exist and must be preserved.

## Incomplete or conflicting with the original review

The review's implicit demo identity finding is stale, but missing membership currently falls back to the home organization with member permissions. Approval accepts any initiative editor. Integration actions trust connection IDs without application tenant checks. Legacy user administration mixes global identity fields with organization membership roles and can demote an owner to admin.

RLS self-insert permits arbitrary self-enrollment. Organization bootstrap visibility exposes any committed ownerless organization. User self-update and broad authenticated Data API privileges require a separate privilege review. Membership administrator policies currently permit owner changes. Later bootstrap migrations do not close these holes.

Timeline override, phase rewrite and downstream generation commit separately. Locking and baseline creation also commit separately. Assumption updates and sprint repacking can partially commit. Full recalculation clears overrides before regeneration. Approval snapshots and history creation are separate commits. Generation preserves approved history but discards unapproved work. Snapshots omit some artifact fields; approved history is updateable under existing RLS. There is no general AuditEvent model.

Money uses Float, structured data uses serialized text, and several cross-parent references lack tenant consistency constraints. Existing migrations must be preserved; new migrations must be additive and verified against a disposable database before deployment.

## Route inventory and affected areas

- Identity: `src/lib/auth/session.ts`, `src/app/api/auth/*`, `src/app/api/account/*`.
- Organization/admin: `src/app/api/admin/users/[userId]/route.ts`, `admin/teams/**`, `admin/access/**`, `admin/dashboard-config/**`; organization switching is in `auth/active-organization`.
- Projects: `src/app/api/projects/route.ts`, `projects/[id]/route.ts`, `projects/[id]/{documents,decisions,risks}/route.ts`.
- Initiatives: `src/app/api/initiatives/route.ts`, `initiatives/[id]/route.ts`, and `{intake,capabilities,validate,generate,recalculate,methodology,assumptions,approve-plan,releases,documents,analyze-intake,planning-weights,roadmap-versions,ai-assist,sync}` descendants.
- ID-based children: `src/app/api/{artifacts,capabilities,releases,documents,context-items,ai-assist-items,ai-jobs}/**/route.ts`. Artifact and capability routes walk parents and invoke initiative guards; integration connections need equivalent checks.
- Reports/status: initiative workspace executive server pages, `src/app/api/roadmap-status/**`, `src/lib/roadmapStatus/service.ts`; batch reads need object-permission review in addition to organization scoping.
- Transaction/history core: `src/lib/db.ts`, `src/lib/generation/{engine,locking,versioning}.ts` and timeline/approval/assumptions routes.
- Schema: `prisma/schema.prisma`, `prisma/migrations/`; new history/audit protection must receive RLS.
- Jira: older `src/lib/sync/jiraStub.ts` and `SyncConnection` feed `JiraSyncPanel`; newer `integrationStub.ts` and `IntegrationConnection` feed the Integrations Hub. Both are referenced. Prefer the newer organization-scoped model for future integration work; retain compatibility and disable simulators in production.
- Gates: `package.json`, lockfile, `vitest.config.ts`, future `.github/workflows/ci.yml`; lint findings in `AiAssistPanel.tsx`, `PlanningQuestionnaire.tsx`, `TimelineRoadmap.tsx`, and workspace epics page.

## Baseline verification

Node 24.15.0 / npm 11.12.1. Test runner/native binding failure is not reproducible: 61 files, 517 tests passed, including seven live database tests (network access required). Lint failed with five errors and three warnings. No CI workflow or typecheck script exists. No application files were modified during inspection. Dependency audit, build and schema checks remain to be run during the relevant stages.

## Implementation boundaries

Keep Supabase/Prisma, planning methodology, AI governance and current working-plan behavior. Do not edit `documentUnderstanding.ts` or `analyzeIntake.ts`. Do not implement live Jira. No destructive migration or live migration deployment is authorized by this assessment; prepare and verify migrations first. Preserve historical records before replacing working rows.
