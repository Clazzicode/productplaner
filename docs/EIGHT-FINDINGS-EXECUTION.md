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
| 2 Collaboration action matrix | 5 | In progress | No | Central action policy, fresh service checks, external-admin cap, scoring authority, story/release separation, feedback receipt path, relevant restrictive RLS. Full suite 955 tests passed before final feedback-policy additions; final CI, deployed role journeys, remaining share/project-context inventory pending. |
| 3 Authenticated context wrappers/inventory | 6 | No | No | Pending |
| 4 Canonical records | 2 | No | No | Pending |
| 5 Reviewed regeneration/reconciliation | 3 | No | No | Pending |
| 6 Planning readiness vs commitments | 1 | No | No | Pending |
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

Pending.
