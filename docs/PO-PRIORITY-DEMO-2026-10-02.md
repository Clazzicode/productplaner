# PO priorities 1, 2 and 6 — implementation and demo guide

**October 2, 2026 · Local implementation, not a production release**

This increment follows the PO's priority order: **Request / Intake Management**, **Requirements Gathering**, and **Prioritization**. It also repairs the audit's scheduling/ownership integrity defects and quality gates. The remaining PO roadmap is still future work.

## Open the demo

The local preview is at **http://127.0.0.1:3012/demo/po-workflow** while its development server is running. To restart it from the application directory:

```powershell
npm run demo:po
```

This is a visibly labeled rehearsal using fictional records in browser memory. Reloading resets it. It neither saves customer data nor invokes AI/Jira. Feature creation is simulated in this rehearsal. The page requires development mode and an explicit flag; production always rejects it.

The actual signed-in workspace is available at `/initiatives/{initiativeId}/requests`, with **Requests & Priorities** in the initiative sidebar. It uses authenticated API operations, saved database records and immutable audit events. The new migration must be applied to the intended environment before using that workspace. No live migration or deployment was performed in this increment.

## Five-minute PO demonstration

1. **Feature 1 — capture a request.** In the new-request editor, enter “Export a filtered map,” choose Enhancement, and name the requestor. Describe the sharing problem, the requested PDF export, and the expected outcome. Save. Point out that it appears in the backlog with a saved revision.
2. **Feature 2 — expose uncertainty.** Select “Save map views for returning users,” then **2 · Clarify requirements**. Show its business rules, dependency and assigned question: “How many views can a user save?”
3. **Demonstrate the safeguard.** Select Requirements ready and save while the answer is empty. The application rejects readiness and explains what is missing.
4. **Resolve the question.** Answer “Ten named views per user for the initial release.” Save as Requirements ready. The open-question count decreases.
5. **Feature 6 — compare priority.** Open **6 · Prioritize**. Explain the six factors and weights. Increase urgency from 4 to 5: the sample score changes from 85 to 90. Increasing delivery risk or effort reduces the score.
6. **Keep the decision with the PO.** Choose Now and enter a reason, such as “Saved views solve a frequent customer problem before visual themes.” Choose PO approved and save. Contrast its decision with the Later theme request. A non-empty rationale is mandatory; the score never approves work automatically.
7. **Show the handoff.** Create planning feature. In the rehearsal this is explicitly simulated. In the signed-in workspace it creates one linked capability, carries across the requirements and value/effort/risk, and records the action. Review MVP scope and dependencies in guided intake before generating or regenerating the plan.
8. **Explain change control.** An approved request must be reopened for clarification before its contents can change. Existing linked features are not silently rewritten when a request is edited.

## What was implemented

- First-class initiative-owned requests, with new-feature/enhancement/defect type, requestor, problem, requested change and expected outcome.
- Business rules, dependencies, owned clarification questions and answers; readiness validation and explicit PO approval/decline.
- Six-factor request scoring, sorted/searchable backlog, Now/Next/Later filter, PO decision and rationale.
- Transactional create/update with a revision check that rejects stale edits. Priority decisions and their prior values are recorded in business audit metadata with the authenticated actor.
- Approved-request-to-capability handoff, protected against duplicate conversion and changes to an approved plan.
- Initiative API authorization and tenant RLS for the new table; browser Data API access is not granted.

The request score is a transparent **triage aid**, not a replacement for the existing roadmap generation/scoring engine. Request Now/Next/Later decisions do not silently reschedule an existing plan. Full story-level reprioritization, request-linked document extraction, real Jira intake and the later refinement/delivery/demo lifecycle remain outside this increment. Existing initiative document intake continues to work separately. The requestor/question owner are recorded names, not a new user-assignment/notification system.

## Integrity and quality remediation

- Manual release/sprint creation now goes through the planning transaction, editability guard, version checkpoint and audit event. Approved Waterfall scheduling is rejected.
- Release existence, phase and story-availability checks now execute inside the transaction. Conditional story claims require all requested stories to be assigned; conflicts roll back instead of silently dropping selected stories.
- Initiative owner count and grant mutation are in one serializable transaction. Concurrent removal/downgrade cannot both commit and remove the last direct owner; a transaction conflict is returned for retry.
- Grant creation/change/removal, project edits, user permission changes and manual scheduling receive transactional audit records.
- Concurrent write errors receive a safe conflict response. Sprint end dates cannot precede start dates.
- Misleading setup/readiness labels were clarified: setup completion is not delivery completion, and generated stories still require PO review.
- Next.js and matching lint configuration were patched from 16.3.5 to 16.3.8. The dependency scan after installation reported zero vulnerabilities.
- Existing CommonJS audit fixtures have a narrowly scoped lint exemption for their CommonJS imports. They remain historical reproductions; new regression tests cover the repaired services.

## Migration and rollout

`prisma/migrations/20261002134608_po_requests/migration.sql` adds `PlanningRequest`, its index, tenant policy, grants and parent-link validation. It removes no existing data. The migration filename was generated with the Supabase CLI and the file was placed in this repository's existing Prisma migration history, avoiding a second migration system.

The table stores validated request content as JSONB and uses explicit initiative, capability, revision and timestamp columns. Its initiative cannot be reassigned; a linked capability must belong to the same initiative. The API independently validates initiative access and input.

Before a shared/customer demo: apply the migration through the normal Prisma deployment procedure in an isolated staging environment, deploy the reviewed branch there, and run the signed-in create → reload → clarify → prioritize → feature handoff journey with two organizations and a view-only member. Local browser rehearsal and isolated tests do not prove a deployed customer journey.

## Verification and evidence

Final local verification on October 2: **623 tests passed across 77 files; typecheck, lint, production build and schema validation passed.** The patched dependency installation reported **zero vulnerabilities**. A running production build returned **404** for the demo even with its flag enabled, and **401** for an unauthenticated request-workspace API call. Hosted live-database integration fixtures remain excluded from the normal suite; these results do not claim production end-to-end verification.

- All migrations, including the new table and policies, replayed in isolated PostgreSQL (PGlite) tests. Cross-organization read, update and insert attempts are rejected; direct browser Data API table access is denied.
- Service tests cover stale revisions, approved-request change control, duplicate feature handoff, approved-plan protection, and rollback on audit failure.
- Scheduling regressions cover approved Waterfall release/sprint creation, duplicate phase releases, unavailable stories, conditional-claim conflicts and audit failure rollback.
- Owner concurrency tests use a serialized transaction double; the database composition test verifies the Serializable isolation setting. No concurrent traffic test against hosted production was run.
- Browser rehearsal verified request capture, readiness rejection, answered clarification, recalculated score, saved PO approval and simulated feature handoff. Desktop and 390-pixel mobile layout were inspected, with no browser errors or horizontal overflow observed.
- Screenshots: `po-demo-initial.png`, `po-demo-priority.png`, `po-demo-mobile.png` in this directory.

Existing uncommitted OpenAI and rate-limit work was preserved. No pull request was merged, no production settings were changed, and no live Jira integration was added.
