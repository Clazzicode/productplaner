# Post-audit remediation — September 25, 2026

## Completed and verified

- **Environment isolation:** hosted preview and explicit staging/test requests fail closed before Auth or database access when they target production, have unverified connection URLs, or mix projects. Auth URL, runtime database URL and optional migration URL are checked. Standard Supabase direct and pooler URLs are supported. Production and local development retain existing behavior. The old opt-in enforcement flag cannot disable protection.
- **Migration history:** compared live rate-limit table columns/defaults, constraints, function definition and grants with the checked-in migration. Recorded the already-installed migration using Prisma's supported `migrate resolve --applied` command. A subsequent status check and independent SQL query confirmed all 35 migrations completed. No new SQL migrations, customer-data edits, or schema replacements.
- **Dependencies:** narrowly override `@prisma/config`'s `deepmerge-ts` to 8.0.0 while retaining Prisma 6.19.3. Clean installation, Prisma generation, the real Prisma config loader, schema validation, tests and build all pass. Full and production-only audits report zero vulnerabilities.
- **CI:** run the existing quality gates on pushes to `master` and `main`, plus PRs and manual dispatch. High/critical dependency findings now fail CI while preserving its audit artifact.
- **GitHub branch protection:** `master` requires a pull request and an up-to-date `verify` check supplied by GitHub Actions (app 15368), including administrators. Force pushes/deletion are disabled and review conversations must be resolved. An additional reviewer is not required for the solo-owner workflow. The saved settings were independently read back.
- **Email accounts:** new registrations use public Supabase email/password sign-up, confirmation, a PKCE callback and post-confirmation workspace provisioning. Password recovery and update routes/forms are rate limited. Cross-origin mutations, unconfirmed sessions, malicious callback redirects and placeholder-email registrations are rejected. Existing username accounts can still sign in. No identities or workspaces were reassigned.
- **Operations documentation:** corrected stale Free-plan and optional-isolation claims, added email rollout instructions, and recorded that the alert recipient has been selected without publishing the address in source control.

## Dependency remediation details

The previous three high-severity audit entries were a single transitive advisory chain: Prisma → @prisma/config → deepmerge-ts 7.1.5, GHSA-ggr8-5vv4-36mx (CVE-2026-40345). The vulnerable operation handles self-referential JavaScript object graphs; ordinary JSON request bodies cannot represent those graphs. Inspection located its use in Prisma's configuration loader, not the application's planning request handlers. This is tooling/configuration exposure, although the earlier lockfile/audit also included it in the production dependency graph.

The upstream fix requires deepmerge-ts 8.0.0; no patch/minor fix was advertised. Release changes affect Map merging, custom-merge types and deepmergeInto behavior; this repository's Prisma config path uses the ordinary `deepmerge` export. A scoped override and real-loader regression test were used instead of Prisma's suggested downgrade or a broad major Prisma upgrade. No vulnerability is temporarily accepted in the final audit. Recheck the override when upgrading Prisma.

Sources: [GitHub advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), [upstream release](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0).

## Verification

| Check | Result |
| --- | --- |
| Clean dependency install / Prisma generation | PASS |
| Typecheck | PASS |
| Strict lint (zero warnings) | PASS |
| Unit/database-fixture tests | 71 files, 581 tests PASS |
| Dedicated authentication / tenant-security suite | 10 files, 95 tests PASS |
| Production build | PASS |
| Prisma schema validation | PASS |
| Production migration status | 35 migrations, up to date |
| Full and production-only npm audits | Zero vulnerabilities |
| Browser smoke check | Email sign-in, sign-up and recovery forms render; no browser errors observed |
| Local production-build `/api/ready` | HTTP 200, database ready, environment isolation ready |

The initial sandboxed local server returned 503 because its database connection could not complete. The exact readiness query passed with approved network access as the restricted `app_rw` role; restarting the local build with that access produced the HTTP 200 result above. This was a local runtime check against the configured database, not a check of the deployed Vercel alias. Unauthenticated visits to `/reset-password` redirected to the login error state as expected.

The security suite uses isolated fixtures and mocks; it is not a new penetration test of the production deployment. Email-provider calls are mocked in regression tests; actual delivered-mail verification remains outstanding.

## Remaining acceptance work

1. Provision/authorize separate staging and configure its own scoped Vercel/Supabase credentials. Preview deployments still using production will deliberately return 503 after this change.
2. Configure each environment's Auth Site URL/allowed callback URLs and verify delivered confirmation/recovery emails with a controlled inbox. Preserve the standard confirmation URL in Supabase templates. Confirm password and email policies in the live provider. The final product sender address is still a pre-launch requirement.
3. Migrate legacy username accounts through an ownership-verified process before those accounts can use email recovery. Existing access remains available.
4. Verify recent managed backup inventory and perform an isolated restore drill. Pro entitlement alone does not establish either.
5. Connect an error-monitoring/alert provider, configure the privately confirmed recipient, and deliver a test alert. No provider credential/configuration or delivered alert was verified in this change.
6. Verify the active production alias and deployed `/api/ready` through the Vercel deployment protection boundary. Local build success is not evidence of production readiness.
7. Set customer/audit retention and organization-deletion policy; extend business-action audit coverage and complete remaining roadmap acceptance work separately.

Live Jira work was not started. The planning engine and protected document-analysis files were not changed. This remediation resolves specific foundation defects; it does not justify a new overall completion percentage or a production-ready claim.
