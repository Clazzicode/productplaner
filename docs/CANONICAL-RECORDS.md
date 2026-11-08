# Canonical planning records

Source: Avery's approved eight-findings plan, milestone 4. This contract describes existing records; it does not introduce new working roles or copy features between tools.

| Object and identity | Owner and scope | Authoritative facts | Lifecycle and relationships |
|---|---|---|---|
| Project — `Project.id` | Workspace; shared-context administration belongs to internal workspace owners/admins | Shared name, budget, team context, constraints, project-scoped decisions, risks and documents | Contains initiatives; shared context is not a second feature backlog |
| Initiative — `Initiative.id` | Workspace and initiative-access boundary | Outcome, description, initiative-specific intake/context and access grants | Draft/intake/planning/delivery state; references one Project. Creating-user identity does not override current membership or grants |
| Feature — `Capability.id` | Its initiative through `IntakeAnswerSet.initiativeId`; optional assigned owner | Feature name/description, priority factors, backlog lane/status/revision, dependencies and release assignment | One feature across backlog and roadmap. Requests link to it; planning artifacts and Jira links reference it. Archiving changes status, not identity |
| Prototype — `Prototype.id` | Exactly one current container per initiative | Current planning-container state, approval/baseline references and generation fingerprint | Contains representations, stories, criteria, sprints and releases. Reviewed reconciliation must preserve this identity (milestone 5) |
| Artifact — `ArtifactLayer.id` | Its Prototype/initiative; optional `sourceCapabilityId` links the canonical feature | Editorial title/body, story/criterion content, hierarchy, readiness and story sprint assignment | Feature artifacts are representations, not additional features. Epic → story → acceptance-criterion hierarchy retains its own stable IDs. Human-edited artifact prose does not silently overwrite authoritative Capability fields |
| Request — `PlanningRequest.id` | Initiative; submitting/source identity retained | Source evidence, requirements, decisions and revisions | Approval precedes promotion. `capabilityId` records the explicit link. Several source requests may support one feature; repeated promotion of the same request must not create another feature |
| Feedback — `FeedbackRecord.id` | Initiative; server-stamped submitting actor/workspace/source | Original submission and reviewed triage/revision evidence | Receipt-only stakeholder submission is separate from internal triage. Applying feedback is an explicit planning action, not an automatic priority update |
| Sprint — `Sprint.id` | Prototype/initiative | Planning window, capacity, number, release link and story assignments | `origin` distinguishes auto/manual; `status` includes reconciliation needs. SprintPlan records reviewed planning decisions. A forecast or generated row alone is not a delivery commitment |
| Release — `Release.id` | Prototype/initiative | Release planning window/order, feature assignments and sprint links | Auto/manual origin is provenance. Final release approval belongs to an authorized workspace administrator through ReleaseReadinessAssessment; manually creating a row is not approval |
| Jira identity — `JiraExternalLink.id` | Workspace, initiative and connection | External issue ID/key, source hash, synchronization baseline/status and local target relation | Source identity is namespaced by connection; reconnect preserves that connection. Feature targets reference Capability IDs; story targets reference ArtifactLayer IDs; bug targets reference BugPlanningRecord IDs. Imported source fields do not confer local planning authority |

## Projections and preservation

Backlog and roadmap feature lists read Capability records. Sprint/release views follow story `sourceCapabilityId`, `sprintId`, Sprint/Release relationships and Capability `releaseId`. Jira feature links point to that same Capability ID. No projection synchronization promotes an artifact into a new Capability.

An existing feature representation is reused without replacing its editorial content. Only one active feature representation for a Capability may exist in a Prototype. Archived representations and immutable version snapshots remain historical evidence. Several epics/stories/criteria for the same feature remain valid.

Null legacy `sourceCapabilityId` values are unresolved identity, not permission to infer identity by title. Preserve them for explicit review. Moving a story to another feature updates its criteria's feature references in the same transaction while preserving their IDs, prose, approvals and delivery links.

## Verified boundaries

Existing database guards already validate request-to-feature scope, feature-to-release scope, artifact parent/container scope and sprint/container scope. Request promotion already uses an expected revision and a serializable planning transaction. Jira external links already have unique source and target mappings per connection. These controls are retained.

The milestone 4 inventory found missing artifact-to-Capability scope enforcement and no uniqueness guard for an active feature representation. Production read-only checks found zero existing violations. The additive migration fails if conflicting legacy records exist; it never merges, rewrites or deletes them. The containment guards prevent reparenting canonical identities to another initiative. Story/criteria identity checks are deferred until transaction completion so an explicitly requested move can update the complete hierarchy atomically.

Full/downstream regeneration still requires milestone 5's reviewed reconciliation. This contract and its constraints alone do not prove destructive regeneration safe.
