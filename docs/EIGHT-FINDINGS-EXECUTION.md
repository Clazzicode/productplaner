# Clarivia: eight findings execution ledger

## Controlling source

Avery's approved nine-milestone plan in **Evaluate architecture considerations**, the eight numbered findings and pasted audit, and the decisions below control this work. Changes must cite a milestone. The earlier **Locate Product Planning repo** general-intake work is a patch source to review, not a branch to publish wholesale.

## Fixed decisions

- Product Owner is the launched workflow for new and existing accounts. Experience is never an authority, navigation, planning-data, or workflow signal. Historical profiles remain compatible but inert.
- Preserve canonical identities, human edits, and delivery commitments. Regeneration proposes reviewed changes; it does not replace live work automatically.
- External stakeholders with actual initiative access may submit feedback only; no plan edits, triage, approvals, or integration administration, including external/admin combinations.
- Internal initiative editors may perform story PO acceptance. Internal workspace owners/admins alone authorize final plan/release/publication and future export approval.
- AI offers bounded, reviewed suggestions; deterministic readiness and permissions govern actions. Manual work remains available without AI.
- Preserve existing app navigation and the approved five-tool 2–2–1 guide: Initiative; Features & Backlog; Stories & Acceptance Criteria; Roadmap; Sprint Planning.
- Small verified releases. Existing resources/budgets only. Jira writes and webhook registration remain disabled; production account connection is user-deferred.

## Milestone status

| Milestone | Source finding | Implemented | Deployed | Accepted / evidence |
|---|---|---|---|---|
| 1 Worker repair and execution health | 8 | Core repair/health implemented; monitoring incomplete | Production PRs 26–27 | Fixed lazy Prisma retention context. CI and staging migration passed. Protected Preview: missing workers ->503; authenticated idle runs ->200; readiness ->200; unauthorized worker ->401; liveness ->200. Production both workers completed successive scheduled cycles at 05:05, 05:10, 05:15 UTC on Nov 8. Test-job/failure injection and delivered alerts remain pending; Avery confirmed no existing monitoring service. |
| 2 Collaboration action matrix | 5 | Implemented; acceptance incomplete | Production PR 28 | Central action policy, fresh service checks, external-admin cap, experience-independent scoring authority, story/release separation, feedback receipt path, restrictive RLS and project-context guards. CI and staging migration passed; 956 local tests passed. Real pooled database checks and signed-in role journeys remain acceptance evidence to complete. Existing publication/provider operations retain workspace-administrator guards; no new publication surface or Jira writes added. |
| 3 Authenticated context wrappers/inventory | 6 | Implemented | Production PR 29, c1c4593 | 194 protected entry points scoped; 221 classified with fingerprinted exceptions. CI passed (967 unit tests), staging passed 14 real pooled role/context/worker tests, including revoked membership, external admins, rollback and concurrent isolation. Production deployment READY and domain aliases verified. Signed-in UI role journeys remain acceptance work. |
| 4 Canonical records | 2 | Implemented | Production PR 30, eb45e7c | Canonical map, scope/containment constraints, active feature uniqueness, idempotent editorial-preserving projections, story/criteria identity. 50 focused tests passed; CI and staging workflow 63 succeeded, including live concurrent projection requests and cross-workspace denial. Production migration applied before application release; Vercel deployment dpl_63iQ5FxAAkufMeVuzQAYqf724BnK READY. |
| 5 Reviewed regeneration/reconciliation | 3 | Implemented | Production PR 31, da4a97c | Durable immutable proposals, structural keys/baselines, preserved edits/commitments, legacy mapping, orphan review, atomic apply/checkpoint/audit and review UI. Existing regeneration paths return proposals; destructive downstream implementation removed. CI 985 tests passed; staging workflow 66 passed live preservation/staleness/repeated submission/rollback checks. Production migration applied before code; Vercel dpl_Ar2weHaFcKWDMNmpPQzTYnReLVT4 READY. Signed-in review usability remains acceptance work. |
| 6 Planning readiness vs commitments | 1 | Implemented; verification in progress | No | Home viewing gates and setup percentage removed; planning evidence/unknown forecasts separated from explicit commitments. Reviewed minimal/resumable intake reused with fresh actor/action checks, atomic empty containers and direct feature entry. Focused lifecycle/backlog/request tests pass. Added staging-only manual planning/lost-response/stale-edit/rollback acceptance without provider HTTP. |
| 7 Feature-led navigation/assistance | 4 | No | No | Pending |
| 8 Field ownership and exact integration changes | 7 | No | No | Pending |
| 9 Operational acceptance | 8 | No | No | Restore, alert delivery, 24h workers, 20-user/30min workload, monitored AI pending. |

## Mandatory checkpoints: after milestones 3, 6, and 9

> Return to Avery's source requirements. Check that every change serves a named requirement, that the evidence supports its completion status, and that no unrelated redesign, permission expansion, or automatic data change has entered the work.

At each checkpoint, pause implementation, reread the sources, and report completed work, evidence, gaps, and deviations. Continue if aligned. Ask Avery before resolving a product-policy conflict or expanding scope. Missing external proof stays pending. No extra paid resource, new role, framework replacement, new connector, or Jira write permission is authorized.

## Acceptance requirements

- M1: empty/test-job paths, retained auth/RLS, safe diagnostics, successful worker cycles including idle, failure/stale readiness, delivered failure alerts.
- M2–3: API/service/SQL action matrix; external feedback receipt without internal context; direct/team/revoked/cross-tenant and concurrent context tests; classified entry-point inventory.
- M4–5: one feature identity across views; reviewed, stale-safe atomic regeneration with checkpoints and durable mappings; edited records and commitments survive real database tests.
- M6–7: no release/sprint or experience gate for viewing work; minimal resumable drafts, honest unknown/forecast/commitment labels; accessible five-tool and full-feature journey without mandatory AI.
- M8: field ownership, sync timestamps/status, local/remote before/after comparisons, frozen future export payloads, conflict review, no Jira writes.
- M9: isolated restore evidence, delivered alerts and 24h observation; 20 concurrent users for 30min, p95 reads <=2s/writes <=3s, unexpected 5xx <1%, no loss/duplicates/leakage, queue drain <=5min; bounded AI outage/timeout/budget/staleness/use-edit-dismiss tests.

## Checkpoint records

### Checkpoint 3 — November 8, 2026

Reread Avery's approved requirements and pasted audit. Milestones 1–3 serve worker reliability, the action matrix and systematic tenant context. No new roles, unrelated redesign, Jira writes or automatic membership rewrites were introduced. PRs 26–29 deployed; 14 real staging tests passed. Failure injection and a terminal synthetic Jira job were exercised without provider HTTP requests; worker readiness recovered after two successful cycles. Delivered alerts, signed-in UI journeys and final operational acceptance remain pending. Earlier failed-test fixture cleanup is separate from implementation and is not a development blocker.

Verification cadence: checks affected by each change; migration/security/smoke checks before production releases; full 20-user/30-minute load test and 24-hour worker observation after the final release. Do not rerun passed checks without a relevant change or unresolved concern.
