# Jira production release checklist

This records the release gate for the tested `feat/jira-bidirectional` implementation. The disposable `CLVTEST` project and its Clarivia connection stay in Preview. The Atlassian app named `Clarivia Staging` also backs the existing production read-only connection; the two flows use separate callbacks and tokens.

## Observed state on 2026-11-12

- Preview: `CLVTEST-1` Story imported and updated after review; `CLVTEST-2` Epic created by approved export; `CLVTEST-3` Bug imported after review. Webhook delivery, PO validation separation, conflict review, repeat import/export idempotence, and manual delivery recheck were observed. Details and remaining scenario checks are in [JIRA-STAGING-ACCEPTANCE.md](./JIRA-STAGING-ACCEPTANCE.md).
- Vercel production project `productplaner` serves `https://nextgendepot.online`. Its earlier Atlassian integration is connected to `mylifecoachrebecca.atlassian.net` with `read:jira-work` and `offline_access` through `app_private.AtlassianOAuthConnection`. The new bidirectional integration uses separate `JiraConnection` records; production has none yet. The existing read-only connection must be preserved during rollout. It does not grant the new writer/webhook scopes.
- The production database already had the base Jira tables. After live staging checks, five additive migrations were applied to production on 2026-11-12: `jira_delivery_mirror`, `jira_delivery_reconciliation`, `jira_create_attempt_guard`, `jira_export_field_baseline`, and `jira_delivery_freshness`. The new columns and private reconciliation function were verified. The legacy read-only OAuth connection remained connected.

## Production OAuth app and Vercel settings

The user prefers to use the existing production Atlassian OAuth 2.0 (3LO) app. Its production `ATLASSIAN_CLIENT_ID` matches the app named `Clarivia Staging` in the current developer console. That app already has the four required classic Jira scopes. The new callback was registered and verified after reload without removing the earlier `/api/atlassian/oauth/callback` callback. The new callback is:

`https://nextgendepot.online/api/integrations/jira/oauth/callback`

The app has the classic Jira scopes `read:jira-work`, `write:jira-work`, `read:jira-user`, and `manage:jira-webhook` configured. The authorization request also asks for `offline_access` to refresh tokens. The user who connects a Jira site must have appropriate access to the selected project.

These values were added to Vercel **Production** and verified, but a deployment is needed before they take effect. The implementation explicitly reuses the existing server-side `ATLASSIAN_CLIENT_ID` and `ATLASSIAN_CLIENT_SECRET` pair, so no duplicate copy of that secret is needed:

| Key | Value |
| --- | --- |
| `JIRA_USE_EXISTING_ATLASSIAN_APP` | `true`; permits reuse of the existing production app credentials only when no dedicated `JIRA_CLIENT_ID`/`JIRA_CLIENT_SECRET` pair exists |
| `JIRA_REDIRECT_URI` | `https://nextgendepot.online/api/integrations/jira/oauth/callback` |
| `JIRA_WEBHOOK_BASE_URL` | `https://nextgendepot.online` |
| `JIRA_TOKEN_ENCRYPTION_KEY` | A new random 32-byte key encoded as 64 hex characters or base64; keep stable after connections are created |
| `JIRA_WRITE_ENABLED` | `true` after the app scopes and migration are verified; otherwise omit it during read-only setup |

Do not copy Preview's token-encryption key into Production. The same Atlassian app currently serves the earlier production read-only connection and the Preview test, but each flow has its own exact callback and stored tokens. Redeploy after changing Vercel environment variables. The previous read-only connection stays available until the new connection has passed its own consent and mapping checks.

## Release sequence

1. Review the completed Preview evidence in staging acceptance. The remaining synthetic uncertain-create and duplicate/older-event scenarios are covered by automated tests, not live Jira fault injection.
2. Verify the prepared production OAuth callback, scopes, and Vercel settings above. Keep the chosen production Jira project separate from `CLVTEST`.
3. The five additive `prisma/migrations/2026111101*` SQL files have been applied to the production database in order. Verify the migration record as part of the final release audit.
4. The tested feature branch was fast-forwarded onto `feat/clarivia-ui-production-review` and commit `da3df56540a0ae19ab03b8c5f7bffacd2b01a055` was built as production deployment `dpl_6dPD5DqBZDgppCTP3dNiUAEt1W6P`. Vercel reported READY with both custom domains assigned. The live domain returned HTTP 200 for `/api/health` and `/api/ready`; readiness reported database, environment isolation, and workers ready, with the expected release commit. Worker observation coverage has not yet accumulated, so it should not be mistaken for a completed sustained worker check. The unauthenticated Jira integration page redirected to sign-in, as expected.
5. Pending production account sign-in: connect an existing production Jira project to its intended Clarivia initiative. The earlier read-only Atlassian connection still exists, but the new `JiraConnection` table remains empty. The new flow needs its own write-scope OAuth consent and reviewed issue type, status, priority, and story point mappings. Then verify a controlled create, update, and status move with explicit approval, and check that PO validation did not change merely because Jira reached Done.
6. Record the production deployment commit, migration versions, site/project mapping, issue keys, and smoke result. Roll back the deployment if the production checks fail; do not erase production Jira records as a rollback action.
