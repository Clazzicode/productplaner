# Features 19–21 and AI Execution Plan

**Prepared:** October 17, 2026 (America/New_York)

## Scope correction

Three Product Owner workflow features remain after Features 14, 16, 17, and 18:

1. **Feature 19 — Release Readiness**
2. **Feature 20 — Feedback and Reprioritization**
3. **Feature 21 — Jira Integration**

Feature 19 cannot be skipped. Product Owner validation determines whether delivered work meets a story's approved outcomes. Release readiness determines whether the collection of validated work, defects, blockers, risks, carryover, and communications is ready to release.

The existing application contains releases, target dates, sprint plans, risks, bugs, demos, sprint reviews, and Product Owner validation. It does not yet contain an authoritative release-readiness assessment or a feedback-to-reprioritization workflow. The current Jira integration is explicitly a development-only simulation and performs no outbound Jira HTTP requests.

## Delivery order

Implement one feature at a time:

1. Merge and deploy Features 16, 17, and 18 and apply their database migrations.
2. Configure OpenAI in Vercel Preview and Production and verify one real bounded AI action.
3. Build Feature 19 to close the delivery-to-release gate.
4. Build Feature 20 to close the release-to-learning-to-backlog loop.
5. Build Feature 21 in read/import and approved-write increments.
6. Run the complete Product Owner journey and production verification.

---

## Feature 19 — Release Readiness

### Product purpose

Give the Product Owner one defensible release view showing what is complete, validated, still open, carried over, or at risk before approving a release.

### Data model

Add:

- `ReleaseReadinessAssessment`
  - organization, project, initiative, and release ownership
  - status: `draft`, `needs_attention`, `ready`, `approved`, `reopened`
  - immutable release and work snapshots
  - summary, communication notes, decision reason
  - revision and optimistic-concurrency fields
  - prepared, approved, and reopened actors/timestamps
- `ReleaseReadinessCheck`
  - check type, result, explanation, evidence, override reason
  - deterministic versus manually confirmed classification
- `ReleaseReadinessRevision`
  - immutable before/after snapshots and actor rationale
- `ReleaseReadinessAiSuggestion`
  - proposed, used, dismissed, or stale status
  - input fingerprint and information-used explanation

### Deterministic readiness gates

Calculate these from existing records:

- Every included sprint plan is committed.
- Included stories have completed demo outcomes where required.
- Included stories have a final Product Owner validation decision.
- Rejected or changes-needed validations have linked follow-up work or an explicit release exception.
- No unresolved critical blocker exists.
- Unresolved dependencies are visible.
- Open defects are grouped by severity and release impact.
- Carryover and incomplete work are listed.
- Release target date and cadence are present.
- Stakeholder communication has an owner and status.

The system may calculate evidence, but only an authorized Owner, Admin, assigned Product Owner, or assigned release approver may approve readiness. Overrides require a reason and remain visible in history.

### User experience

Add a **Release Readiness** workspace page with:

- release selector and readiness status
- completed, validated, open, and at-risk work totals
- defect counts by severity
- blockers, dependencies, carryover, and incomplete work
- checklist with evidence links
- release communication summary
- approve, reopen, and create-follow-up actions
- immutable history and comparison

### AI implementation

Add one bounded action: `DRAFT_RELEASE_SUMMARY`.

It may:

- summarize deterministic readiness evidence
- draft stakeholder-facing release notes
- identify evidence already recorded as needing attention
- draft communication wording for approved facts

It may not:

- mark a release ready
- approve an exception
- invent completion, validation, defect, or risk data
- change a target date, release assignment, or status

Use/edit/dismiss is explicit. Reuse identical results by input fingerprint. Suggested initial limits: 20 generations per user and 200 per organization each month, with a 1,500-token output limit.

### 95% acceptance gate

- Database migration, RLS, application authorization, revisions, and audit events pass.
- Readiness is calculated from real sprint, demo, validation, blocker, dependency, bug, and release records.
- Stale concurrent decisions are rejected.
- Failed approval and follow-up operations roll back completely.
- Cross-organization access is rejected independently of RLS.
- Browser journey covers prepare, override, approve, reopen, and history.
- One real deployed AI summary is generated, edited, applied, and dismissed without changing readiness automatically.

---

## Feature 20 — Feedback and Reprioritization

### Product purpose

Capture what was learned from customers, stakeholders, demos, sprint reviews, validation, and releases, then turn accepted feedback into traceable backlog or priority decisions.

### Data model

Add:

- `FeedbackRecord`
  - source: customer, stakeholder, demo, sprint review, release, meeting, support, Jira, or manual
  - source reference and original evidence
  - summary, outcome, impact, urgency, submitter, owner, status
  - links to request, feature, story, bug, sprint, release, meeting, demo, or validation
  - duplicate fingerprint and archive lifecycle
- `FeedbackRevision`
  - immutable before/after history and rationale
- `FeedbackFollowUp`
  - linked request/backlog item created from accepted feedback
- `ReprioritizationProposal`
  - previous and proposed MoSCoW, priority, roadmap placement, and release assignment
  - evidence and rationale
  - proposed, approved, rejected, applied, or stale lifecycle
- `FeedbackAiSuggestion`
  - structured suggestion with use/edit/dismiss lifecycle and input fingerprint

### Workflow

1. Capture feedback and preserve its source.
2. Triage it as duplicate, informational, accepted, rejected, or needs follow-up.
3. Link it to existing work or create one traceable request.
4. Prepare a reprioritization proposal showing current versus proposed values.
5. Require an authorized Product Owner/Admin to approve or reject it.
6. Apply an approved proposal transactionally through the existing priority service.
7. Preserve the previous priority, new priority, actor, evidence, and reason.

### User experience

Add a **Feedback** workspace page with:

- inbox and source filters
- linked work and release filters
- duplicate warning
- triage and owner assignment
- create-follow-up action
- current versus proposed priority comparison
- approve/reject/apply controls
- visible feedback-to-backlog-to-roadmap traceability

### AI implementation

Add two bounded actions:

1. `SUMMARIZE_FEEDBACK`
   - produces a concise summary, themes, requested outcomes, and unresolved questions from supplied feedback
2. `RECOMMEND_REPRIORITIZATION`
   - proposes priority factors and explains how recorded feedback may affect MoSCoW, priority order, roadmap placement, or release assignment

AI must use existing evidence only. It cannot create a backlog item, change priority, move roadmap work, or assign a release without explicit approval. Suggestions become stale when linked evidence or priority data changes. Suggested initial limits: 30 feedback summaries and 20 reprioritization recommendations per user each month.

### 95% acceptance gate

- Manual feedback and feedback from demos, sprint reviews, releases, and meetings preserve their source.
- Duplicate detection works without discarding source evidence.
- Follow-up request creation is atomic and deduplicated.
- Reprioritization uses existing authorization, optimistic concurrency, priority history, and audit events.
- AI suggestions support use/edit/dismiss and cannot mutate authoritative data directly.
- Browser journey covers feedback capture through an approved backlog priority change.
- Tenant-isolation and rollback tests pass.

---

## Feature 21 — Jira Integration

### Product boundary

Guided Planning remains the Product Owner planning layer. Jira remains the execution system. The first live increment should import execution information and publish only explicitly approved planning work. It should not attempt a broad two-way mirror.

### Increment 21A — Connection and read/import

- Replace the demo connector with one canonical Jira connection model.
- Use one distributable Atlassian OAuth 2.0 (3LO) application; do not collect customer API tokens or ask customers to create separate OAuth apps.
- Encrypt refresh/access tokens at rest and never expose them to the browser or logs.
- Store tenant, Atlassian account, cloud resource, Jira project, and granted scopes.
- Discover accessible sites, projects, issue types, fields, statuses, priorities, and versions.
- Create explicit project, issue-type, status, priority, and field mappings.
- Import epics, stories/tasks, bugs, status, assignee, estimates, sprint, and release/version references.
- Preserve Jira issue ID/key, remote timestamps, source payload hash, and last-import cursor.
- Preview every import and handle duplicate/conflicting local records before applying it.

### Increment 21B — Approved export

- Export approved features/stories and acceptance-criteria content only after a Product Owner/Admin preview and confirmation.
- Use Jira create/edit metadata to construct valid payloads, including Atlassian Document Format where Jira requires it.
- Add idempotency records so retries cannot create duplicate issues.
- Store one result per exported item: created, updated, skipped, conflict, or failed.
- Never silently overwrite a Jira change made after the last synchronized version.
- Keep planning-only fields local unless a specific Jira field mapping is approved.

### Increment 21C — Durable synchronization and recovery

- Use a durable job/queue abstraction for imports and exports.
- Add bounded retries with backoff, idempotency keys, partial-failure recovery, cancellation, and replay.
- Register and verify Jira webhooks for relevant issue changes.
- Renew expiring dynamic webhook registrations.
- Deduplicate and order webhook events using remote IDs/timestamps.
- Add reconnect, revoke, stale-connection, and resynchronization workflows.
- Record audited user intent separately from remote execution results.

### Required security and integrity controls

- Tenant-scope every connection, mapping, job, item result, and credential lookup.
- Owner/Admin controls connection and mapping changes.
- Product Owner/Admin approves outbound operations.
- Use least-privilege OAuth scopes and respect the connecting user's Jira permissions.
- Encrypt secrets with a versioned key and support rotation/revocation.
- Do not log OAuth codes, access tokens, refresh tokens, full sensitive payloads, or customer document content.
- Add rate limiting to OAuth callbacks, imports, exports, and retries.
- Verify callback state/PKCE and webhook bearer signatures/tokens.

### AI implementation

AI is not part of OAuth, token handling, synchronization, retries, conflict detection, mapping integrity, or webhook processing.

AI may optionally:

- draft a Jira-ready issue description from an approved local story and acceptance criteria
- summarize an import conflict in plain language
- suggest a field mapping from metadata for user review

Every proposed description or mapping must be reviewed and explicitly accepted. Deterministic code remains authoritative for IDs, mappings, payload construction, conflicts, and synchronization.

### 95% acceptance gate

- Connect and revoke a Jira test site through OAuth 2.0 (3LO).
- Discover and map a Jira test project.
- Import epics, stories, and bugs without duplicates.
- Preview and export approved work.
- Retry the same export without creating duplicates.
- Inject partial failure and recover only failed items.
- Detect a local/remote edit conflict and require a user choice.
- Reject cross-organization connection, job, mapping, and item access.
- Verify credential rotation/revocation and redacted logs.
- Process and deduplicate a signed webhook event.
- Complete the deployed browser-to-API-to-database-to-Jira journey.

---

## AI implementation across the product

The existing AI architecture already enforces the correct product model: bounded actions, structured output, per-action limits, user-visible information sources, reuse by fingerprint, and explicit use/dismiss decisions. There is no conversational chatbot.

Before claiming AI complete:

1. Configure `OPENAI_API_KEY`, `OPENAI_MODEL`, and `AI_ENABLED` in Vercel Preview and Production.
2. Confirm the selected economical model supports the structured Responses API calls used by the application.
3. Verify pricing configuration and usage-ledger writes.
4. Run one successful deployed action for each workflow family:
   - intake/requirements
   - feature/story/criteria
   - priority/roadmap
   - refinement/clarification
   - demo/review/validation
   - release readiness/feedback
5. Verify use, edit, dismiss, reuse, stale-input behavior, per-user limits, organization limits, failure messages, and redacted logs.
6. Add an admin usage view for action, model, tokens, estimated cost, failures, and limit utilization.

## Final roadmap completion gate

Completing Features 19–21 and deploying the AI actions can complete the defined 21-feature Product Owner roadmap. It does not by itself establish that the production system is risk-free or literally 100% complete.

The roadmap should be reported as complete only after:

- Features 16–21 are merged and deployed.
- All migrations are applied and `/api/ready` is healthy.
- Real AI and Jira test-environment journeys pass.
- Signup, email confirmation, recovery, and tenant-isolation browser journeys pass.
- Backup restore, monitoring alert, staging isolation, secrets rotation, and operating policies are verified.
- The Product Owner accepts the end-to-end workflow:

  **Request → Requirements → Feature → Priority → Roadmap → Story/Criteria → Refinement → Sprint → Clarification → Demo → PO Validation → Release Readiness → Feedback/Reprioritization → Jira execution**

