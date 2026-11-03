# Clarivia — Next Product Owner Feature Implementation Plan

**Plan date:** October 8, 2026  
**Product source of truth:** Tiana's Product Owner backlog and updated workflow conversation supplied by Avery  
**Starting point:** Features 1, 2 and 4–10 are approximately 95% complete. Feature 10 is merged and deployed through PR #6.

## Product boundary

Clarivia remains the Product Owner planning layer around Jira. The application should help the PO prepare, decide, clarify, validate and communicate. Jira remains the execution system.

AI remains bounded. It may summarize supplied information, identify gaps, propose questions or produce a draft. It must not silently change requirements, readiness, sprint scope, validation or release decisions. Every AI result must show its information source and require an explicit use, edit or dismiss action. Usage limits and reusable results remain in effect.

## Recommended delivery sequence

### Milestone 1 — People, work links and planning controls

This milestone supplies the shared data required by every later workflow.

#### Feature 3 — Structured Stakeholder Management

Add structured assignments without confusing product roles with security roles.

Product roles:

- Requestor
- Business owner
- Product Owner
- Decision maker
- Engineer or technical owner
- Stakeholder
- Demo owner
- Validator

Required behavior:

- Assign organization members to a request, feature, story, refinement session, sprint, demo, release or decision.
- Allow an external stakeholder contact when the person is not an application member.
- Record responsibility, influence, interest, engagement expectation and assignment history.
- Display the accountable owner and decision maker in refinement and sprint workflows.
- Keep OWNER, ADMIN and MEMBER as authorization roles; stakeholder roles describe work responsibility only.
- Audit assignment, reassignment and removal.

Acceptance:

- A PO can identify who requested work, owns the business outcome, makes the decision and answers engineering questions.
- Cross-organization assignments are rejected at the API and RLS layers.
- Removing an organization member does not erase historical attribution.

#### Bug Management foundation

Keep `PlanningRequest` as the original intake/source record. Add relational bug-planning data so bugs can be queried without repeatedly decoding JSON.

Required behavior:

- Preserve manual and spreadsheet bug intake already implemented.
- Add affected feature, story, sprint and release links.
- Track source, source reference, bug type, severity, status, priority, environment and owner.
- Allow a bug to enter refinement and sprint readiness without converting it into a feature.
- Prevent duplicate import using tenant, external system, external key and source fingerprint.
- Preserve one bug record throughout backlog, roadmap, sprint, release and reporting views.
- Leave live Jira import for Feature 21.

Acceptance:

- A manually entered or spreadsheet-imported bug appears once in the backlog and can be linked to a feature and release.
- Its status and severity appear in roadmap quality risk and later reporting.
- Imported source evidence remains immutable.

### Milestone 2 — Feature 11: Refinement Management

Feature 10 prepares the work. Feature 11 records what happens when the PO and engineers refine it.

Add a durable refinement session with:

- Title, scheduled date, status and facilitator.
- Participants using structured stakeholder assignments.
- Selected stories and bugs.
- Purpose and agenda.
- Questions, answers, owners and due dates.
- Decisions and rationale.
- Estimates before and after refinement.
- Dependencies, blockers and scope changes discovered during the session.
- Follow-up actions.
- Completion status and session summary.

Reuse existing capabilities:

- `RefinementFinding` for missing information, engineering questions and follow-up.
- Story and acceptance-criterion history for approved changes.
- Existing decision and audit patterns.
- Existing bounded ChatGPT review for suggested questions and summaries.

AI behavior:

- Before the session, suggest questions from the selected stories, criteria, bugs, dependencies and open findings.
- After notes are supplied, propose a concise summary, decisions and follow-up items.
- Nothing is saved as a decision, requirement or action until the PO approves it.
- The PO receives a limited number of explicit refreshes rather than an open-ended chatbot.

Acceptance:

- A PO can create a session, select work, record participants, answer questions, capture decisions and finish the session.
- Every changed story or criterion retains its own reason and history.
- Unresolved questions and actions survive the session and remain assigned.
- A completed session can be used by Sprint Readiness without copying data manually.

### Milestone 3 — Feature 15: Dependencies and Blockers

Complete Feature 15 before enforcing sprint readiness.

Required behavior:

- Support dependencies between features, stories, bugs, sprints and releases through foreign-keyed records.
- Track blocker type, description, owner, status, due date, resolution and affected work.
- Distinguish a risk from an active blocker.
- Prevent dependency cycles where ordering is directional.
- Show unresolved dependencies and blockers in the backlog, refinement session, roadmap, sprint planning and release readiness.
- Allow resolution with reason and immutable history.
- Add deterministic gates consumed by Features 12, 13 and 19.

Acceptance:

- A blocked story cannot become sprint-ready without an authorized override and reason.
- A dependency whose prerequisite is unfinished is visible during refinement and sprint planning.
- Closing a blocker records who resolved it, when and how.
- Cross-organization links are impossible.

### Milestone 4 — Sprint Preparation: Features 12 and 13 together

These features share one workspace and data pipeline but remain separate decisions.

#### Feature 12 — Sprint Readiness

Purpose: determine whether a story or bug is eligible to be considered for a sprint.

Readiness checklist:

- Clear problem and expected outcome.
- Story narrative is adequate.
- Acceptance criteria are adequate and approved.
- Estimate exists.
- Refinement is complete.
- Required decisions are resolved.
- Required dependencies are satisfied or explicitly accepted.
- No unresolved blocking issue.
- Final priority decision exists.
- Required owner is assigned.

Required behavior:

- Display pass, fail and needs-review for every check.
- Record the PO's ready, not-ready or overridden decision.
- Require a reason for an override.
- Preserve decision history and invalidate readiness when governed content changes.
- Include both stories and eligible bugs.

#### Feature 13 — Sprint Planning Support

Purpose: choose from eligible work and commit a feasible sprint.

Required behavior:

- Show only sprint-ready work by default.
- Display priority, dependencies, blockers, estimate and feature/release context.
- Capture sprint goal, start/end dates and cadence.
- Show available capacity and planned load.
- Select stories and bugs without exceeding capacity unless the PO records an override.
- Detect duplicate or conflicting assignments transactionally.
- Capture carryover work and its reason.
- Support draft and committed sprint states.
- Generate a proposed sprint using bounded AI or deterministic ordering, but require PO approval before assignment.

Shared acceptance for Features 12 and 13:

- A non-ready item cannot be silently added to a committed sprint.
- Concurrent planners cannot assign the same item to conflicting sprints.
- A readiness change immediately affects the planning candidate list.
- The final committed sprint records goal, capacity decision, selected work and actor.
- Failure during commit rolls back the sprint and every assignment.

## Meeting Management

Meeting Management should reuse the refinement-session foundation instead of becoming a disconnected calendar product.

Add:

- Meeting type: refinement, sprint planning, demo/review, stakeholder review, release readiness or other.
- Participants and facilitator.
- Purpose and linked initiative/work items.
- Notes, uploaded transcript or linked source document.
- Outcomes: what happened.
- Decisions and follow-up actions with owners and due dates.
- Bounded AI summary generated from supplied notes/transcript.
- Explicit approval before AI-proposed decisions or actions become durable records.

Delivery timing:

- Build the first meeting type as the Feature 11 refinement session.
- Reuse it for sprint planning in Milestone 4.
- Extend it later for demos, sprint reviews and release readiness.

## Reporting

Reporting should project authoritative workflow data rather than create a second set of manually maintained numbers.

Initial Product Owner report:

- Sprint status and sprint goal.
- Planned, completed, in-progress and carried-over work.
- Capacity, planned load and historical velocity.
- Backlog priorities and changes.
- Scope changes.
- Open risks, dependencies and blockers.
- Quality indicators and bugs by severity/status.
- Current sprint stories and bugs.
- Refinement/readiness status.
- Stakeholder-facing narrative summary.

Report behavior:

- Filters by initiative, sprint, release and date range.
- Live view from current records.
- Immutable snapshot when shared or exported.
- Show data freshness and missing information.
- Export to a stakeholder-readable format.
- Bounded AI may draft the narrative summary from report data; the PO reviews it before publishing.

Delivery timing:

- Add reusable reporting queries during each milestone.
- Deliver the first complete report after Sprint Preparation because capacity, readiness, blockers and committed work will then be authoritative.
- Expand it after demo, validation and release-readiness features are built.

## Suggested pull-request boundaries

1. Structured stakeholder assignments and authorization tests.
2. Bug planning links, deduplication and cross-workflow projections.
3. Refinement session model and manual workflow.
4. Refinement notes/transcript plus bounded AI summary and follow-up approval.
5. Story/sprint/release dependencies and blockers.
6. Sprint-readiness checklist, decisions and invalidation.
7. Unified Sprint Preparation workspace combining readiness candidates and sprint planning.
8. Atomic sprint draft/commit, capacity and carryover.
9. Initial Product Owner reporting and immutable shared snapshot.

Each pull request should include tenant authorization, RLS, audit events, transaction/concurrency tests, focused route/service tests, UI acceptance checks, schema validation, typecheck, lint, full tests and production build.

## Completion target

Completing these milestones should produce this demonstrable flow:

**Request or bug → feature/story → refinement preparation → refinement session → dependencies/blockers resolved → PO readiness decision → capacity-aware sprint commitment → stakeholder report**

That flow implements the planning work Tiana described without recreating Jira and creates the correct foundation for later in-sprint clarification, demos, PO validation, release readiness, feedback and live Jira integration.

