# Jira Cloud integration setup

Feature 21 uses an Atlassian OAuth 2.0 (3LO) app. It does not accept customer API tokens or Atlassian passwords.

## Atlassian app

1. Create one OAuth 2.0 integration in the Atlassian developer console.
2. Add the callback URL for each environment:
   - local: `http://localhost:3000/api/integrations/jira/oauth/callback`
   - staging: `https://<staging-host>/api/integrations/jira/oauth/callback`
   - production: `https://<production-host>/api/integrations/jira/oauth/callback`
3. Grant classic scopes `read:jira-work`, `write:jira-work`, `read:jira-user`, and `manage:jira-webhook`. Enable offline access so rotating refresh tokens are issued.
4. Keep staging and production app credentials separate.

## Environment variables

Set these only in the server environment. Never prefix them with `NEXT_PUBLIC_`.

```text
JIRA_CLIENT_ID=
JIRA_CLIENT_SECRET=
JIRA_REDIRECT_URI=https://<host>/api/integrations/jira/oauth/callback
JIRA_TOKEN_ENCRYPTION_KEY=
JIRA_WEBHOOK_BASE_URL=https://<host>
CRON_SECRET=
```

`JIRA_TOKEN_ENCRYPTION_KEY` must be 32 random bytes encoded as Base64, or 64 hexadecimal characters. Generate a new key per environment and store it in the deployment secret manager. Rotating this key requires re-encrypting existing credentials or asking users to reconnect Jira.

`JIRA_WEBHOOK_BASE_URL` must be the public HTTPS origin for the same environment. Keep `CRON_SECRET` random and server-only; Vercel sends it as a Bearer token to the scheduled durable-job endpoint. Staging and production must use different values.

## Verification

1. Sign in as an organization owner or administrator.
2. Open `/integrations/jira`, connect Atlassian, and select the intended site and project.
3. Create an import preview. Confirm no planning records change yet.
4. Review creates, updates, unchanged items, and conflicts. Conflicts cannot be selected.
5. Apply selected items with a reason and verify feature, story, and bug source links.
6. Create an export preview. Confirm that Jira remains unchanged and conflicts cannot be selected.
7. Select the exact items, record an approval reason, approve the frozen snapshot, and then use the separate execute action.
8. Confirm only approved items were created or updated in Jira and that the resulting Jira identity and snapshot were recorded.
9. Enable webhooks, deliver a test Jira issue update, and verify one deduplicated webhook event creates an import preview.
10. Force one temporary delivery failure, verify exponential retry evidence, and use **Process queued work** to prove recovery.
11. Create a two-sided change, verify the conflict is blocked, record a Product Owner resolution, and create a fresh preview before applying either direction.
12. Revoke the Atlassian grant and confirm the UI requires reconnection after the next token refresh.

Existing connections must reconnect once to grant `write:jira-work` and `manage:jira-webhook`. Guided Planning never treats AI output as approval and no AI route can execute an export, resolve a conflict, or apply a webhook-generated preview.

The implementation follows Atlassian's current [OAuth 2.0 3LO guidance](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/) and [Jira REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/).
