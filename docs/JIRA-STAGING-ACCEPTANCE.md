# Jira bidirectional sync: staging acceptance

## Evidence and ownership

The Avery–Rebecca transcript says the product team works in Clarivia and the delivery team works in Jira (transcript lines 139–147). Rebecca asks for a bidirectional sync so developers' Jira progress updates Clarivia (lines 145–147). Avery also expects the platform to retain the last data through a lost connection and catch up once Jira is reachable (lines 111–113). The transcript does not specify which Jira project, issue type IDs, workflow statuses, or exact production OAuth app to use; those require a real tenant review.

Clarivia owns product requirements, roadmap placement, risk and decisions, and PO acceptance. Jira owns issue identity and delivery execution status. Jira Done is delivery evidence; it never automatically means the PO accepted the work. Shared title/description changes require review.

## Prepared staging environment

- Branch: `feat/jira-bidirectional`; stable preview URL: `https://productplaner-git-feat-jira-bidirectional-averylovings-projects.vercel.app`.
- Test-only Supabase project: `qbogvclmehvrtuwiktos`. The additive delivery mirror, reconciliation, create-attempt guard, outbound field-baseline, and delivery freshness migrations have been applied there. The production Supabase project has not been migrated for this release.
- The preview branch has `JIRA_REDIRECT_URI`, `JIRA_WEBHOOK_BASE_URL`, `JIRA_TOKEN_ENCRYPTION_KEY`, and `JIRA_WRITE_ENABLED=true`. It still needs Jira OAuth client credentials with the callback below registered in the Atlassian developer console. No connected write-scoped Jira account exists in staging as of 2026-11-11.
- Callback to register: `https://productplaner-git-feat-jira-bidirectional-averylovings-projects.vercel.app/api/integrations/jira/oauth/callback`.
- Required OAuth scopes in this implementation: `read:jira-work`, `write:jira-work`, `read:jira-user`, `manage:jira-webhook`, and `offline_access`. The exact Atlassian app configuration must be checked against the tenant before use.

## Acceptance sequence using disposable Jira work

1. Configure `JIRA_CLIENT_ID` and `JIRA_CLIENT_SECRET` for this preview branch and register its callback in the matching Atlassian OAuth app. Redeploy the preview so the variables are active. Confirm `/api/health` returns 200 and `/api/ready` reports the database and environment isolation ready; worker freshness may need a manual worker cycle in preview.
2. Sign in as an organization owner/admin, connect the test Jira site, select a disposable Jira project and Clarivia test initiative, and review issue type, status, priority, and story point mappings. Confirm the connection shows `connected` and includes `write:jira-work`.
3. Create one disposable Clarivia feature, story, and bug. Preview the export, check the exact frozen fields, select and approve them with a reason, then execute. Verify each Jira issue appears exactly once and stores a stable link/key in Clarivia. Repeat preview and worker processing; issue counts must not increase.
4. Change the linked story summary/description in Clarivia and approve an update. Verify Jira receives only those fields; Jira status, assignee, labels, priority, and sprint remain untouched. Change the Jira status and then preview another Clarivia title change; status movement alone must not cause an outbound conflict.
5. With the story page and backlog/dashboard open in Clarivia, move the Jira issue from To Do to In Progress to Done. Verify the Jira delivery state and source/observed/last-checked timestamps update without a manual reload. Check the linked work list in feature, refinement, and sprint views. Confirm PO acceptance/validation and planning lane remain unchanged.
6. Change summary on both sides and confirm a reviewable conflict blocks an automatic overwrite. Resolve through the explicit review flow, then make a fresh preview.
7. Deliver a duplicate or older event and confirm no duplicate local records or status regression. Stop the webhook temporarily, change Jira, then run reconciliation and confirm the latest Jira state appears. Revoke or interrupt access, confirm a visible stale/error state, restore access, and confirm recovery.
8. Simulate an uncertain create response after Jira creates an issue. Confirm automatic retry refuses a second create. In the recovery panel, enter the verified existing Jira key and a reason; confirm it links without issuing a new create.
9. Inspect staging job attempts, conflict records, audit events, and the worker readiness endpoint. Record Jira event time, Clarivia observed time, visible browser time, and the before/after Jira issue counts. Keep the disposable issue keys and evidence in the release record.
10. After all checks pass, apply the same additive migrations to production, configure production Jira OAuth/webhook/write settings, deploy the tested commit to production, and verify health, readiness, and a controlled production smoke check. Do not connect the staging OAuth app or staging database to production.

## Current release gate

Local typecheck, full tests, and production build passed. A preview deployment exists. Real Jira end-to-end evidence is still pending because the staging Jira OAuth client credentials, callback registration, and write-scoped test connection are absent. Production promotion follows the acceptance sequence above.
