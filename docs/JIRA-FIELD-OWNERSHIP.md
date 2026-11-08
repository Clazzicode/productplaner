# Jira ownership and reviewed changes — milestone 8

Jira is read-only in the deployed configuration. OAuth requests read scopes; write execution and webhook registration stay disabled. Production account authorization remains Avery's choice.

## Contract

- Jira owns site/project/issue identifiers and execution evidence (status, priority, labels, source updated time).
- Reviewed imports copy summary/description and normalized story estimates into canonical records. New records retain Clarivia initial planning status. A refresh never translates Jira Done into PO acceptance.
- Clarivia owns priority/lane/value/risk/owner choices, requirements/criteria, triage, acceptance, dependencies and sprint/release commitments. Bug refresh preserves the existing request and all these local fields.
- Mappings point to one canonical local ID. Per-field source/local hashes establish comparisons without retaining source prose on long-lived mappings. Legacy baselines are explicitly unknown.

## Review and application

Import item review snapshots freeze before/proposed values, field ownership, baseline time, local/remote change flags and preserved fields. The reviewed connection revision and canonical record fingerprint are checked again inside serializable apply. Reconnect/remapping, edits after preview, legacy reviews, duplicate creation and repeated apply require a fresh review rather than overwriting work. Conflicting mapping types require resolution.

The integration page is restricted to internal workspace owners/admins and displays only the selected connection's preview. It shows successful source-read time separately from latest sync attempt and last applied import. A successful read is a point-in-time snapshot; refresh is needed to discover later remote changes.

Future export previews expose exact fields/payloads, target IDs, known before values, omissions and conflicts. Updates freeze only summary/description because those are the actual fields the dormant execution path sends. Immutable approval hashes bind the review and payload. Legacy export previews require refresh. No write permission or deployment flag is enabled by this work.

## Retention

Import comparison snapshots inherit the existing 30-day preview expiry and disconnect deletion. Export comparison snapshots are scrubbed with source results after 30 days or disconnect; existing immutable payload/approval/audit evidence remains. Mapping baselines contain only validated SHA-256 hashes; disconnect removes mappings. Local imported planning records remain under the existing planning retention policy.

## Evidence

Affected tests exercise independent local/remote comparisons, unknown baselines, normalized estimates, stale edits, reconnect/disconnect, duplicate creates, legacy reviews and precise future update fields. PostgreSQL replay verifies immutable review snapshots, hash-only mappings, legacy-apply rejection and disconnect erasure. Real staging adds an edited bug refresh with zero provider HTTP calls. Live Jira acceptance remains separate from synthetic database verification.
