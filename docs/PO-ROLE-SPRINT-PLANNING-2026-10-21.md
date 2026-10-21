# Product Owner launch boundary and guided sprint planning

Product Owner is the only launched **working role** for every account, including accounts created before this change. Working roles describe the product experience; they do not grant organization access. Owner, admin, and member remain separate authorization roles. New accounts are provisioned as Product Owner, read-side role resolution maps any legacy or unset value to Product Owner, and role-update APIs only accept Product Owner. The strategic roadmap implementation remains in the codebase for a future Product Manager experience, but no account can reach that screen while Product Manager is unavailable.

## Product Owner journey

1. Create an initiative and complete the guided intake. The intake still uses the current generation pipeline to prepare features, epics, stories, criteria, sprint shells, and capacity assumptions. This preserves existing data and prevents sprint planning from opening without candidate work.
2. Open **Sprint Planning** as the main post-generation destination. The readiness evaluation displays evidence and gaps for each story or bug. The Product Owner records ready/not-ready, or an authorized organization owner/admin records a reasoned override.
3. Choose a sprint, write an outcome-oriented sprint goal, select assessed work, and review or enter point estimates. An editable draft can be saved before commitment. The system displays missing inputs and capacity overage; it does not silently commit anything.
4. Optionally request the existing AI sprint recommendation. It uses supplied team/capacity information only, shows its sources/assumptions, and requires an explicit review or application action. It does not change sprint scope automatically.

Beginner and experienced users pass the same readiness checks and API validation. The existing experience-level setting changes explanatory depth during intake, not authority or required data.

## Boundaries still to verify before external launch

- The internal generation engine still creates roadmap phase artifacts because release, story, and sprint relationships depend on them. The PO-facing handoff is now sprint planning, while the strategic roadmap UI is reserved for Product Manager. A later architectural separation can remove PM-only generation artifacts from the PO pipeline after downstream dependencies are mapped.
- The PO dashboard's delivery outlook still derives from generated phases. Validate with users whether this short-horizon view is useful or whether it should be replaced by committed-sprint/release progress.
- Verify automatic velocity and capacity against real team history; never present a default or AI estimate as measured velocity.
- Jira sync remains a separate integration path; do not assume it is complete merely because sprint planning exists.
- Generated epics/stories remain editable through the existing workspace. Their readiness assessment must be rerun after substantive changes.

## Realistic acceptance scenarios

- A new PO signs up: only Product Owner can be selected. Account and admin APIs reject an attempted Product Manager or Project Manager assignment. Organization permission role is unaffected.
- A new initiative has insufficient context: planning readiness names missing answers. The user cannot treat a detailed generated backlog as reliable until core validation passes.
- A story lacks approved criteria, estimate, or refinement: readiness explains the gap and will not mark it ready. An authorized override needs a written reason and remains visible.
- A bug lacks a point estimate: the sprint draft requires an explicit estimate instead of silently assigning one point.
- The chosen work exceeds sprint capacity: the gap is visible and commitment stays disabled. The PO can revise scope or estimates and save a draft.
- The draft is saved, reopened, and edited; commitment is a separate action. AI recommendations do not automatically change selected work.
- Any account opens the strategic roadmap URL directly: it returns them to Sprint Planning. Product Manager cannot be selected or reached until that experience is deliberately launched.
