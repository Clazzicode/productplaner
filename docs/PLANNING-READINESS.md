# Planning value and delivery commitment — milestone 6

Home displays available authorized planning information without a manual-release/manual-sprint gate. The authenticated entry route no longer requires a qualifying profile. Historical lifecycle stages provide recommendations only; the 0/33/66/100 setup percentage has been removed from runtime reporting and widgets. Administrative delivery completion remains explicitly unknown until completion evidence exists.

Planning evidence reports canonical features, active stories/criteria and missing problem/customer/outcome context. Generation readiness uses deterministic intake validation only when describing or requesting generation; it does not grant access or require AI. Delivery evidence separately reports committed SprintPlan records and approved release decisions. Forecast and cost widgets label missing inputs unknown. Sprint/release displays distinguish forecasts from explicit commitment/approval evidence.

## Reconciled earlier intake work

Reviewed the general-intake specification and individual source files from the older `guided-planning-platform-v2` checkout. Reused the bounded intake schema, resume-pointer form and draft-save structure, updated them for the current authenticated wrappers and action matrix. Did not copy its migration, older permission shortcuts or complete checkout.

The current draft service rechecks verified identity, active internal membership and initiative editing authority. A name can save incomplete context. A client UUID, user/workspace/project-scoped resume pointer and idempotent same-content retry retain identity after a lost creation response. Stale initiative/intake timestamps reject competing edits. Project, initiative, owner access, empty containers and audit are created atomically. Existing generated or approved work cannot be rewritten through the draft endpoint.

Empty initialization is explicit for older initiatives. It creates no stories, estimates, dates or delivery assignments. Direct features and approved request promotion add a canonical feature projection and manual story container, preserving existing editorial content. Existing generation, sprint commitment, validation and release-approval guards remain in their services. No experience policy migration or Jira permission change is needed.

The five-tool presentation and removal of remaining active experience guidance are milestone 7. Signed-in desktop/mobile/keyboard journeys and full operational acceptance remain separate evidence.
