# Dependency remediation

Checked 2026-09-18 with Node 24.15.0 and npm 11.12.1.

## Remediated

- `next` 16.2.12 -> 16.3.5 and `eslint-config-next` 16.2.12 -> 16.3.5. This removes the critical Windows-hosted remote-code-execution advisory and updates bundled PostCSS and Sharp. It is a compatible Next 16 patch/minor upgrade and the production build passes.
- `vitest` 4.1.10 -> 4.1.11. This removes the development-only mock redirect/path traversal advisory. All tests pass.
- npm's compatible audit repair updated vulnerable transitive packages including brace-expansion, js-yaml and nanoid.
- `prisma` moved from production dependencies to development dependencies. The deployed runtime uses `@prisma/client`; the Prisma CLI only generates/validates schema during install/CI.
- Exact versions are used for the security-sensitive framework/test updates and the lockfile remains committed.

## Accepted temporarily

- Prisma CLI 6.19.3 pulls `@prisma/config` -> `deepmerge-ts` 7.1.5. The advisory concerns stack exhaustion while merging recursive configuration objects. It is development/build tooling, is not imported by application request code, and is unreachable from tenant input. npm proposes a forced Prisma downgrade as its automated fix; that is not a safe remediation. Recheck when Prisma publishes a compatible fixed release.
- npm 11 resolves optional WASM packages with conflicting optional peer metadata. `.npmrc` enables `legacy-peer-deps` so `npm ci` is deterministic. This affects optional build-tool bindings, not application authorization or database access.

No force upgrade was run.
