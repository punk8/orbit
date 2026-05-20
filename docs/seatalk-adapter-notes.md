# SeaTalk Adapter Notes

## Decision

Orbit should not scrape SeaTalk or infer a private read path without an explicit, supported interface.

The current implementation keeps SeaTalk ingestion limited to approved import fixtures. This preserves the adapter shape, schema, cursor behavior, sensitivity defaults, and downstream pipeline compatibility without bypassing application permissions or reading private messages from the local machine.

## Current Safe Interface

- `SeaTalkAdapter` accepts an `approvedImportDirectory`.
- Records must use `sourceKind: "seatalk"`.
- Default sensitivity is `confidential`.
- The adapter is read-only and exposes only `incremental_read` and `thread_metadata`.
- No replies, message sends, task creation, or app automation are implemented.

## Blocker For Real SeaTalk Ingestion

A production adapter needs one of these approved inputs:

- an official local export format,
- an internal API with user-authorized read scopes,
- a connector that returns messages through audited permissions,
- or user-provided sanitized import files.

Until one exists, Orbit should keep SeaTalk fixture-backed and document the limitation in Sources/Settings rather than silently collecting data.

## Required Production Checks

- Confirm authorization scope and data retention rules.
- Preserve source pointers that can explain where a message came from.
- Keep private chat, group chat, mentions, and on-call events distinguishable in Event context.
- Redact or avoid raw message storage when policy requires summary-only retention.
- Keep side-effect actions disabled unless a later goal adds explicit review and audit flows.
