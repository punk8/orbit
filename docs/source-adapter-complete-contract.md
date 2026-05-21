# Source Adapter Complete Contract

## Purpose

This document defines the complete Source Adapter contract for Orbit. The goal is to make every
input channel replaceable while keeping the core Event model stable.

Adapters must only collect and normalize. They must not decide what is important long term,
silently summarize business meaning, or bypass user permissions.

## Stable Responsibilities

Every adapter must:

- Declare identity, source kind, display name, capabilities, permission scope, sensitivity default,
  retention policy, and export/AI eligibility.
- Read incrementally from an explicit user-configured boundary.
- Convert source records into normalized Events.
- Preserve source pointers that are meaningful to the user or support audit.
- Produce stable Event IDs or enough stable input for Event ID generation.
- Return warnings for malformed, skipped, redacted, unsupported, or partially imported records.
- Avoid side effects against the source system.

Every adapter must not:

- Scan private default paths without explicit setup.
- Store credentials in source configuration plaintext.
- Execute writes in the source system.
- Generate Knowledge, Memory, or Recommendations directly.
- Hide source sensitivity.
- Treat raw payload persistence as required.

## Interface Shape

The common adapter shape is:

```ts
interface SourceAdapter {
  id: string;
  kind: SourceKind;
  displayName: string;
  capabilities: readonly SourceCapability[];
  defaultSensitivity: Sensitivity;
  permissionScope: PermissionScope;
  readCursor(cursor?: string): Promise<AdapterReadResult>;
}
```

The permission scope must be explicit:

```ts
interface PermissionScope {
  sourceKind: SourceKind;
  readableFields: string[];
  canStoreRaw: boolean;
  canStoreSummary: boolean;
  canUseForAI: boolean;
  canExportToAgent: boolean;
  retentionPolicyId: string;
}
```

## Adapter Configuration

Each configured source must store:

- Adapter ID.
- Source kind.
- Display name.
- User-selected path, API scope, import file, or OS permission boundary.
- Enabled/paused state.
- Cursor.
- Last sync time.
- Last event time.
- Last warning/error.
- Permission scope.
- Default sensitivity.
- Retention policy.
- Version of adapter configuration.

Configuration rules:

- Paths must be absolute after setup.
- OAuth/API credentials must be stored through OS keychain or an encrypted credential store.
- Source setup must show exactly what will be read before ingestion.
- Reconfiguration must write an audit log.
- Cursor reset must be idempotent and must not duplicate Events.

## Cursor Semantics

Adapters should prefer durable source-native cursors. If unavailable, use a deterministic local
cursor.

Allowed cursor forms:

- File offset or line count for append-only local files.
- Last modified timestamp plus source ID for folders.
- API page token or sync token for SaaS systems.
- Latest source event ID for ordered APIs.
- Import manifest version for approved export bundles.

Cursor requirements:

- Reusing an old cursor may reread records, but Event upsert must deduplicate.
- Cursor reset must only affect future ingestion.
- Missing cursor must mean "read from beginning of configured boundary".
- Cursor corruption must be reported as a source warning and should fall back to safe reread when
  possible.

## Event Normalization Rules

Each source record must map to an Event with:

- Stable ID or stable hash input.
- `source.kind`, `source.adapterId`, `source.externalId` when available, and `source.pointer`.
- `occurredAt` and `observedAt`.
- Actor where available.
- Context hints: app, window title, URL, project, repository, thread, conversation.
- Event type.
- Content title, summary, or text depending on permission.
- Classification only when the source provides reliable native metadata or a later pipeline adds it.
- Privacy metadata.
- Hash.

Adapters should preserve the smallest useful source pointer:

- `codex://session/<id>#<turn-or-command>`
- `local-agent://session/<id>#<turn>`
- `seatalk-import://<file>#<line>`
- `calendar://event/<id>`
- `mail://message/<id>`
- `docs://document/<id>#<revision-or-section>`
- `jira://issue/<key>#<comment-or-history>`
- `gitlab://project/<id>/merge_requests/<iid>`
- `filesystem://<root-id>/<relative-path>#<hash-or-line>`
- `screen://capture/<session-id>#<frame-or-window>`
- `audio://meeting/<id>#<segment>`

## Source-Specific Requirements

### Fixtures

Purpose:

- Demo, tests, golden evaluation, and onboarding.

Requirements:

- Synthetic or sanitized only.
- Stable JSONL format.
- No dependency on private local data.
- Can represent Codex, local agent, chat, meeting, task, and repository events.
- Should include malformed examples for adapter robustness tests.

### Codex Local Sessions

Purpose:

- Read engineering sessions, commands, code changes, tests, conclusions, and user/agent decisions.

Setup:

- User provides explicit session file or directory path.

Requirements:

- Read-only.
- Incremental cursor.
- Parse malformed records with warnings, not crashes.
- Normalize commands, command results, code-change summaries, test results, todo/follow-up, and
  decision-like events.
- Do not mutate Codex files.
- Do not infer durable project facts inside the adapter.

Default policy:

- Sensitivity: internal.
- Raw storage: off.
- AI: allowed if source permission and event sensitivity allow.
- Agent export: allowed unless event is secret or redaction failed.

### Generic Local Agent Sessions

Purpose:

- Read Claude Code or other local agent exports without hard-binding Orbit to one vendor.

Setup:

- User provides explicit file/folder path and optional app label.

Requirements:

- Share the same normalized engineering event vocabulary as Codex where possible.
- Preserve original provider name in context/app metadata.
- Support tool calls, command outputs, file-change summaries, tests, user instructions, and final
  conclusions.
- Do not require private default paths.

Default policy:

- Sensitivity: internal.
- Raw storage: off.
- AI and export: policy-based.

### Approved Chat Imports

Purpose:

- Bring communication context into Orbit without direct app scraping.

Setup:

- User provides an approved import file or directory.

Requirements:

- Normalize direct messages, group discussions, mentions, on-call events, decisions, todo items,
  participants, conversation/thread IDs, and timestamps.
- Treat unsupported export fields as warnings.
- Keep participant identifiers minimal.
- Do not send, reply, mark read, scrape UI, or bypass app permissions.

Default policy:

- Sensitivity: confidential.
- Raw storage: off.
- AI: blocked unless user explicitly allows the source.
- Agent export: blocked unless user explicitly allows the source.

### Calendar

Purpose:

- Provide meeting context, time windows, attendees, agenda, and event metadata.

Setup:

- OAuth scope or approved calendar export.

Requirements:

- Read event metadata, attendee list, title, description when allowed, meeting links, recurrence,
  project hints, and updates/cancellations.
- Respect private calendar flags.
- Prefer summaries over raw descriptions for confidential calendars.
- Use calendar events as grouping anchors for meeting Activity Sessions.

Default policy:

- Sensitivity: internal; private calendars confidential.
- Raw storage: off.
- AI/export: allowed for non-private metadata, blocked for private/confidential details by default.

### Mail

Purpose:

- Capture work decisions, follow-ups, and project context from explicitly authorized mail.

Setup:

- OAuth labels/folders/query scope or approved export.

Requirements:

- Require narrow scopes such as selected labels, senders, folders, or queries.
- Normalize message metadata, subject, sender/recipients, thread ID, timestamps, attachments
  metadata, and summary.
- Avoid full-body raw storage by default.
- Track delete/archive only if source capability permits and user allowed it.

Default policy:

- Sensitivity: confidential.
- Raw storage: off.
- AI/export: blocked by default unless narrowed and approved.

### Docs And Notes

Purpose:

- Capture project docs, meeting notes, design docs, and decision records.

Setup:

- Explicit folder, document list, or OAuth scope.

Requirements:

- Normalize document title, path/URL, author, modified time, section anchors, summary, and revision
  metadata.
- Prefer section-level source pointers.
- Support changed-section detection when available.
- Avoid indexing documents outside the configured boundary.

Default policy:

- Sensitivity: internal or confidential based on source.
- Raw storage: off.
- AI/export: policy-based.

### Jira / Task System

Purpose:

- Capture issue status, ownership, blockers, comments, and follow-ups.

Setup:

- OAuth/API token with selected projects.

Requirements:

- Normalize issue creation, status changes, assignment, comments, labels, priority, due dates,
  dependencies, and resolution.
- Use issue key as project/task pointer.
- Do not create or update tickets in the read-first product.

Default policy:

- Sensitivity: internal.
- Raw storage: off.
- AI/export: allowed unless project policy blocks it.

### GitHub / GitLab / Repository

Purpose:

- Capture commits, merge requests, reviews, CI, issues, and repository activity.

Setup:

- Explicit repository path or API scope.

Requirements:

- Normalize commit metadata, MR/PR title, review comments, CI status, branch, files changed summary,
  issue links, and release notes.
- Avoid storing full diffs by default.
- Link repository events to Codex/local agent Activity through repo/project hints.
- Do not modify branches, create commits, or push.

Default policy:

- Sensitivity: internal.
- Raw storage: off.
- AI/export: allowed for summaries; full code/diff export requires explicit policy.

### Filesystem

Purpose:

- Read user-approved local files, notes, exports, logs, and project directories.

Setup:

- Explicit allowlisted folder or file.

Requirements:

- Respect ignore rules and protected patterns.
- Track metadata and summaries first.
- Hash content for change detection.
- Avoid secret files, credentials, `.env`, key material, and dependency caches by default.
- Provide a dry-run preview of files to be indexed.

Default policy:

- Sensitivity: internal/confidential.
- Raw storage: off.
- AI/export: policy-based.

### Screen / Accessibility

Purpose:

- Add context for browser, UI, design, and app work that is not available through APIs.

Setup:

- Explicit OS permissions and visible running state.

Requirements:

- Prefer active app/window metadata and Accessibility text before screenshots.
- ScreenCaptureKit frames and OCR require explicit enablement.
- Support pause, stop, app/window exclusions, protected apps, short TTL, storage caps, and audit
  logs.
- Raw screenshots must be blocked from default Handoff and external AI.
- Failed redaction data must not be exported.

Default policy:

- Sensitivity: confidential.
- Raw storage: short TTL only.
- AI/export: blocked by default.

### Audio / Meeting Transcription

Purpose:

- Capture meeting and call context when explicitly enabled.

Setup:

- Explicit microphone/system audio permission or approved transcript import.

Requirements:

- Prefer transcript imports before live audio capture.
- Live capture requires visible state, pause/stop, retention controls, and protected app rules.
- VAD/transcription should run locally where feasible.
- Speaker labels and transcripts require sensitivity handling.
- Raw audio must not enter default Handoff.

Default policy:

- Sensitivity: confidential.
- Raw storage: short TTL only.
- AI/export: blocked by default.

## Error And Warning Model

Adapters should return structured warnings for:

- Malformed records.
- Unsupported source version.
- Missing timestamp.
- Missing stable source pointer.
- Redaction applied.
- Raw content skipped by policy.
- Cursor fallback.
- Partial import.
- Permission-scope mismatch.
- Source read failure.

Warnings must be visible in Sources UI and audit logs when ingestion runs.

## Adapter Acceptance Tests

Each adapter must have tests for:

- Empty source.
- Single record ingestion.
- Multi-record ingestion.
- Cursor continuation.
- Cursor reset.
- Duplicate input idempotency.
- Malformed input warning.
- Permission scope validation.
- Raw storage disabled.
- Secret/redacted content handling.
- Source pointer stability.
- Event hash stability.
- Source deletion and reconfiguration behavior where applicable.

## Production Readiness Checklist

Before a source adapter is production-enabled:

- Source setup is explicit and reviewable.
- Permission scope is visible in UI.
- Cursor model is documented.
- Sensitivity defaults are conservative.
- Raw storage default is justified.
- AI/export defaults are justified.
- Malformed input cannot crash background ingestion.
- Source warnings and errors are surfaced.
- Idempotent ingestion is tested.
- Privacy cleanup works for legacy records.
- Adapter does not perform side effects.

