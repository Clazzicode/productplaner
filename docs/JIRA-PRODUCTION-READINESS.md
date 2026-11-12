# Jira production release checklist

This is the remaining release gate for the tested `feat/jira-bidirectional` implementation. The disposable `CLVTEST` connection and `Clarivia Staging` OAuth app stay in Preview.

## Observed state on 2026-11-12

- Preview: `CLVTEST-1` Story imported and updated after review; `CLVTEST-2` Epic created by approved export; `CLVTEST-3` Bug imported after review. Webhook delivery, PO validation separation, conflict review, repeat import/export idempotence, and manual delivery recheck were observed. Details and remaining scenario checks are in [JIRA-STAGING-ACCEPTANCE.md](./JIRA-STAGING-ACCEPTANCE.md).
- Vercel production project `productplaner` serves `https://nextgendepot.online`. Its earlier Atlassian integration is connected to `mylifecoachrebecca.atlassian.net` with `read:jira-work` and `offline_access` through `app_private.AtlassianOAuthConnection`. The new bidirectional integration uses separate `JiraConnection` records; production has none yet and has no `JIRA_*` settings. The existing read-only connection must be preserved during rollout. It does not grant the new writer/webhook scopes.
- The production database already has the base Jira tables. Preview has five newer additive migrations that production lacks: `jira_delivery_mirror`, `jira_delivery_reconciliation`, `jira_create_attempt_guard`, `jira_export_field_baseline`, and `jira_delivery_freshness`.

## Production OAuth app and Vercel settings

The user prefers to use the existing production Atlassian OAuth 2.0 (3LO) app. Its production `ATLASSIAN_CLIENT_ID` matches the app named `Clarivia Staging` in the current developer console. That app already has the four required classic Jira scopes. The new callback was registered and verified after reload without removing the earlier `/api/atlassian/oauth/callback` callback. The new callback is:

`https://nextgendepot.online/api/integrations/jira/oauth/callback`

The app must grant classic Jira scopes `read:jira-work`, `write:jira-work`, `read:jira-user`, and `manage:jira-webhook`. The authorization request also asks for `offline_access` to refresh tokens. The user who connects a Jira site must have appropriate access to the selected project.

Set these on Vercel **Production** only. The implementation can explicitly reuse the existing server-side `ATLASSIAN_CLIENT_ID` and `ATLASSIAN_CLIENT_SECRET` pair, so no duplicate copy of that secret is needed:

| Key | Value |
| --- | --- |
| `JIRA_USE_EXISTING_ATLASSIAN_APP` | `true`; permits reuse of the existing production app credentials only when no dedicated `JIRA_CLIENT_ID`/`JIRA_CLIENT_SECRET` pair exists |
| `JIRA_REDIRECT_URI` | `https://nextgendepot.online/api/integrations/jira/oauth/callback` |
| `JIRA_WEBHOOK_BASE_URL` | `https://nextgendepot.online` |
| `JIRA_TOKEN_ENCRYPTION_KEY` | A new random 32-byte key encoded as 64 hex characters or base64; keep stable after connections are created |
| `JIRA_WRITE_ENABLED` | `true` after the app scopes and migration are verified; otherwise omit it during read-only setup |

Do not copy Preview's token-encryption key into Production. The same Atlassian app currently serves the earlier production read-only connection and the Preview test, but each flow has its own exact callback and stored tokens. Redeploy after changing Vercel environment variables. The previous read-only connection stays available until the new connection has passed its own consent and mapping checks.

## Release sequence

1. Finish the remaining Preview recovery checks listed in staging acceptance, especially a missed webhook state change followed by reconciliation, and access interruption followed by reauthorization.
2. Verify the production OAuth app's callback and scopes, and add the Production Vercel settings above. Keep the chosen production Jira project separate from `CLVTEST`.
3. Review and apply the five additive `prisma/migrations/2026111101*` SQL files to the production database in order. Verify columns, job type constraint, and the private reconciliation function before deploying application code.
4. Merge the tested feature branch into the Vercel production branch, deploy, and check `/api/health`, `/api/ready`, worker readiness, and the Jira integration page.
5. Connect the chosen production Jira site/project/initiative with a production account. Review issue type, status, priority, and story point mappings. Verify a controlled create, update, and status move with explicit approval, then check that PO validation did not change merely because Jira reached Done.
6. Record the production deployment commit, migration versions, site/project mapping, issue keys, and smoke result. Roll back the deployment if the production checks fail; do not erase production Jira records as a rollback action.
