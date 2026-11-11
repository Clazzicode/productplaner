# Clarivia ↔ Jira: product-to-delivery sync plan

Status: product and field-ownership contract. The Jira delivery mirror, browser polling, reconciliation worker, and outbound duplicate guard are implemented on the `feat/jira-bidirectional` preview branch. Live Jira acceptance and production deployment are pending. Follow [the staging acceptance checklist](JIRA-STAGING-ACCEPTANCE.md) for the release gate.

## 1. What the conversation establishes

Rebecca distinguishes the two teams: “This is the product team. They don't work in JIRA. The delivery team works in JIRA. So the stuff that's coming from here is going in JIRA.” When Avery asks whether completed developer work should update his system, Rebecca answers “Yes” and calls for a “bi-directional sync with JIRA.” Avery describes Jira as the source of truth for execution information and wants Clarivia to retain information through a lost connection and catch up when it reconnects.

Those statements define the goal, not a complete field mapping. In this plan, Clarivia owns product planning and product-owner decisions; Jira owns delivery execution. Shared descriptive fields require a reviewed change when both sides have edited them.

## 2. Current baseline in this repository

- `README.md` still describes the original demo sync stub. The newer Jira integration has OAuth and read-only import previews, but real outbound writes and webhook registration are disabled in the current rollout.
- `docs/JIRA-DATA-BOUNDARY.md` limits current reads to issue ID/key, summary, description, type, status, priority, labels, parent key, configured story points, and update time, up to 2,000 issues per selected project. Assignee, sprint, version, comments, attachments, and user profiles are not currently read.
- `docs/JIRA-FIELD-OWNERSHIP.md` defines Jira execution evidence and Clarivia planning ownership. Reviewed imports may copy summary, description, and normalized story estimates; Jira Done does not mean product-owner acceptance.
- `src/lib/jira/export.ts` contains dormant, gated export preview/approval/execution code. It proposes Epic, Story, and Bug issues; creates can include issue type, summary, and description. Existing-issue updates send only summary and description. Status transitions, assignee, labels, sprint and release assignments, priority, and deletions are omitted.
- `src/lib/jira/webhooks.ts` and `src/lib/jira/jobs.ts` contain the gated webhook/job path. On the preview branch, a webhook also fetches a linked issue and updates its Jira-owned delivery mirror, while the open story/backlog/dashboard views poll for revisions. Shared planning changes still require import review.

The preview branch has not yet been exercised against a connected, write-scoped Jira account. “Connected” alone is not proof of end-to-end two-way or live behavior.

## 3. Target user workflow

1. An organization admin connects the correct Atlassian site and binds one Jira project to the intended Clarivia initiative. The admin reviews issue-type, status, priority, and story-point mappings.
2. A product owner captures a request, refines its feature, stories, acceptance criteria, and bug records, and marks delivery-ready items. Internal drafts and unapproved AI suggestions do not go to Jira.
3. The owner previews the exact Jira creates/updates, resolves conflicts, selects items, records a reason, approves, and executes. Each successful item stores its stable Jira issue ID, visible key, project binding, local record ID/type, exported field hashes, and sync time. A failed item stays visible for retry; it must not masquerade as delivered.
4. Developers work on those issues in Jira. Jira issue events trigger a queued fetch of the canonical issue from Jira. The platform updates its **execution mirror** for that linked item: Jira status and mapped delivery state, priority, labels, last Jira update, and other explicitly approved execution fields. This must not change PO acceptance, planning lane, scope, requirements, dependencies, or sprint/release commitments.
5. An open Clarivia page receives or fetches the new execution-mirror version and refreshes its status, progress, activity, and applicable health views without a manual page reload. It shows “last Jira update,” sync state, and stale/disconnected state. A user reopening the page sees the persisted latest state.
6. If Jira or Clarivia is unavailable, events and jobs retry. A scheduled reconciliation read catches missed or out-of-order events. When the connection returns, the mirror catches up; changes to shared fields still go through review.

Example: a PO approves a Clarivia story for delivery; export creates `ABC-123` in Jira and links it to the Clarivia story. A developer moves `ABC-123` to an in-progress status, then Done. Each Jira change updates the story’s **Jira delivery status** and the relevant progress views. The story remains **awaiting PO validation** until the product owner accepts it in Clarivia. A Jira Done event must never silently close the product-owner decision.

## 4. Field and direction contract

| Data | Direction and owner | Target behavior |
| --- | --- | --- |
| Organization, initiative, roadmap lane, business value, risk, product owner, requirements, acceptance criteria, decisions, dependencies, PO validation | Clarivia-owned | Keep canonical in Clarivia. Export only specifically mapped delivery context; a Jira refresh must not overwrite these fields. |
| Approved feature, story, and bug title/description | Clarivia → Jira on approved export; Jira → Clarivia only through reviewed import for remote edits | Store source/local baselines; detect two-sided edits. Never use last-write-wins. |
| Jira site/project/issue ID and key, issue type, parent key | Jira-owned identity | Link one Jira issue to one canonical local item in the selected organization/project. Preserve the stable issue ID even if a visible key changes. |
| Jira workflow status and mapped delivery state | Jira → Clarivia execution mirror | Apply automatically after authenticated event/reconciliation fetch. Show Jira Done separately from PO acceptance. |
| Jira priority and labels | Jira → Clarivia source evidence | Reflect in a Jira execution panel. Do not overwrite Clarivia’s product priority, value, risk, or planning lane. |
| Story points | Shared estimate; current import is reviewed | Show proposed normalized change. Decide whether future Jira edits should be automatic only after the product team agrees which estimate is authoritative. |
| Sprint, fix version/release, assignee, resolution, completion time, comments | Not in current read allowlist | Add only with a defined use case, scope, privacy review, field mapping, and test. Do not claim these drive live progress yet. |
| Clarivia acceptance/validation result | Clarivia-owned | Do not infer from Jira status. A future write to Jira, if wanted, requires a separate explicit mapping and approval. |

“Source of truth” is therefore **per field**. Jira is authoritative for the execution mirror; Clarivia is authoritative for product planning. Summary and description are shared fields with review on conflict.

## 5. Near-real-time architecture and guarantees

**Event path:** Jira webhook → validate connection and webhook secret → deduplicate event ID → durable queue → fetch the current Jira issue by stable ID → verify project binding and issue type → compare source timestamp/hash → update the execution mirror transactionally → emit a Clarivia data-change notification or let the client revalidate → update the open UI.

The webhook is a trigger, not the data source. Fetching the issue handles duplicate, delayed, and out-of-order events. Never trust a webhook body alone to overwrite a planning record. Idempotency must ensure repeated delivery does not create duplicate local records or duplicate activity entries. Persist processing time, source update time, attempt count, and failure state for support.

**Recovery path:** periodically reconcile linked issues changed since the last successful cursor, with a safe overlap window; also provide an admin “Sync now.” A disconnected page displays the last successful Jira read and clearly marks data stale. If event delivery or processing fails, retry with backoff and surface a terminal error. A reconnect resumes from a persisted cursor or a full reviewed rescan if the cursor is unusable.

**User-facing target:** changes in Jira should normally appear in an open Clarivia session within seconds after Jira delivers its event and the worker completes. This is a target to measure in staging, not an absolute guarantee: Atlassian delivery, queue availability, API limits, and browser connectivity can delay it. Define and measure p50/p95 event-to-visible latency and reconciliation lag before promising a specific service level.

The existing webhook worker generates a full-project import preview. That remains suitable for shared planning changes, but is insufficient for automatic delivery-status updates. Implement a narrow linked-issue execution-mirror handler and a client revalidation/notification path. Keep full-project imports as a separate reviewed workflow.

## 6. Work packages, in order

1. **Confirm the mapping contract.** For one staging Jira project, decide which Clarivia feature/story/bug types map to which Jira issue types, how parent links work, which statuses map to planned/in-progress/done/blocked, and what “delivery ready” means. Verify whether 126 items discussed in the call are features, stories, or both before bulk export.
2. **Prove outbound delivery on staging.** Enable write scopes only on a separate authorized staging connection. Review exact payloads, approve and execute a small create/update set. Verify stable links, retries, and no duplicate issues. Extend payloads only for approved mapped fields; never assume current code sends sprint, acceptance, or priority fields.
3. **Add the execution mirror.** Store a Jira-owned status snapshot and derived delivery state separately from PO status. Add a targeted event processor that fetches the issue and updates only Jira-owned mirror fields. Keep review for descriptive or estimate changes.
4. **Make the UI live.** Revalidate relevant project, story, backlog, and dashboard views when a mirror row changes. Display update timestamps and sync failures. Prevent stale browser data from overwriting a newly received Jira status.
5. **Add reconciliation and operations.** Register/renew webhooks for the authorized connection, add periodic delta reconciliation, monitor job failures and latency, and test disconnect/reconnect and token revocation.
6. **Run acceptance tests.** Verify create, update, in-progress, Done, PO acceptance remaining separate, duplicate/out-of-order webhooks, missed event recovery, two-sided summary conflict, bulk export, two organizations with similar issue keys, and Jira outage recovery. Compare issue counts before/after and inspect an open browser’s update latency.

## 7. Release boundary

The current deployed Jira mode is read-only and its import application requires review. Outbound writes and webhook registration need additional OAuth scopes and a separately approved rollout, as `docs/JIRA-INTEGRATION-SETUP.md` states. This document authorizes no production Jira mutation. Implementation and staging verification can proceed against disposable Jira data; production enablement should follow the tested mapping, field ownership, and monitoring results.
