# Collaboration actions

Source: Avery's approved eight-findings plan, milestone 2. Experience and dashboard visibility never confer authority.

| Action | Internal workspace owner/admin | Internal initiative editor | Internal viewer | External with actual initiative access |
|---|---|---|---|---|
| Authorized initiative view | Yes | Yes | Yes | Existing stakeholder view |
| Submit feedback | Yes | Yes | Yes | Yes |
| Planning/scoring edits, feedback triage, story PO acceptance | Yes | Yes | No | No |
| Final plan/release approval, publication | Yes | No | No | No |
| Integration management, future Jira export approval | Yes | No | No | No |

`src/lib/access/actions.ts` is the application action policy. `actionGuard.ts` rechecks the verified actor, current membership and initiative grants at the service boundary. `app_private.can_initiative_action` is its PostgreSQL counterpart; migration replay tests exercise the actual policies. Existing stricter policies remain in force. An external administrative assignment confers no implicit initiative access and cannot bypass the external cap. Conflicting assignments appear on the Users administration page for an internal owner to review; they are never rewritten automatically.

The stakeholder submission endpoint accepts title, details and an optional validated record link. Actor, workspace, source and initial state come from the server. Its response contains only a receipt. The feedback page presents this form to viewers and external members before loading internal triage or AI information. Internal triage APIs require edit access. Source record links must belong to the same initiative. Repeated captures are rejected by the existing durable deduplication key.

Story acceptance and final release approval use different actions. Stakeholder titles such as Product Owner or validator do not grant either action. Caller-provided administrator flags are retained in legacy service signatures for compatibility and ignored by the new action checks.

Jira write execution and webhook registration remain disabled. Future export approval is an authorization policy, not permission to enable Jira writes.

Acceptance remains separate from implementation. See `EIGHT-FINDINGS-EXECUTION.md` for deployment and test evidence and unresolved surfaces.
