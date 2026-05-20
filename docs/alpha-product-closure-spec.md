# Alpha Product Closure Spec

## Purpose

This spec defines the minimum product loops Orbit needs before Alpha users can try it safely.

Alpha is not feature-complete, but it must be coherent: users should understand what Orbit collected, what it derived, what needs review, what can be used as memory, and how to undo or export local state.

## Alpha User Promise

Orbit runs locally, ingests explicitly configured work-context sources, turns them into traceable Activity, Knowledge, Memory, and Recommendation objects, and lets users review or reject the derived results before they become durable context.

## Required Product Loops

### 1. Source Setup Loop

Users can configure local sources explicitly.

Required source types:

- Codex local sessions.
- Claude/Claude Code or generic local agent sessions.
- Approved SeaTalk import files.
- Synthetic fixtures for demo/testing.

Required states:

- `not_configured`
- `configured`
- `ingesting`
- `healthy`
- `warning`
- `error`
- `disabled`

Required actions:

- Add source.
- Disable source.
- Run ingestion.
- View last ingestion result.
- View warning/error details.

Rules:

- Do not scan default private paths silently.
- Do not read SeaTalk directly without an approved read path.
- Every source must show what path/interface it reads.

### 2. Activity Loop

Users can inspect what happened.

Required views:

- Activity list grouped by date.
- Activity detail with time window, apps, source kinds, event count, sensitivity, and evidence.
- Source pointers visible in detail.

Required actions:

- Rebuild Activity Sessions from Events.
- Open linked Knowledge generated from an Activity Session.

Rules:

- Activity is evidence, not long-term memory.
- Activity must not hide source sensitivity.

### 3. Knowledge Review Loop

Users can turn generated drafts into reviewed knowledge.

Required states:

- `draft`
- `needs_review`
- `confirmed`
- `rejected`
- `archived`

Required actions:

- Edit title.
- Edit description.
- Edit key insights.
- Confirm.
- Reject.
- Archive.
- View evidence.

Rules:

- Generated Knowledge starts as `draft` or `needs_review`.
- Confirmed Knowledge remains traceable to Activity Sessions and Events.
- Rejecting Knowledge prevents Memory extraction from that artifact.
- Archiving Knowledge hides it from default agent context but keeps it available for audit/search unless deleted.

### 4. Memory Governance Loop

Users can decide what becomes durable memory.

Required states:

- `needs_review`
- `confirmed`
- `rejected`
- `archived`

Required actions:

- Generate candidates from confirmed Knowledge.
- Confirm candidate.
- Reject candidate.
- Archive confirmed Memory.
- Edit body/tags/scope before confirmation.
- Search confirmed Memory.

Rules:

- Do not auto-confirm Memory.
- Do not convert full Knowledge markdown into Memory.
- Default agent context includes confirmed active Memory only.
- Candidate Memory can be shown in review UI but must be marked as unconfirmed.

### 5. Recommendation Loop

Users can handle suggestions without Orbit taking side effects.

Required states:

- `new`
- `accepted`
- `dismissed`
- `snoozed`
- `resolved`

Required actions:

- Accept.
- Dismiss.
- Snooze.
- Resolve.
- Expand evidence.

Rules:

- Accepting a Recommendation records user intent only; it does not send messages, create tasks, modify code, or call external systems.
- Every Recommendation must include explanation, suggested action, confidence, impact, and evidence.
- A Recommendation without evidence should not be displayed.

### 6. Context Export Loop

Users and external agents can read bounded context.

Required commands/actions:

- `orbit context today --json`
- `orbit context project <name> --json`
- app export for selected date/project

Rules:

- Export should prefer concise summaries and confirmed Memory.
- Include evidence IDs/source pointers.
- Do not include raw private payloads by default.

### 7. Local Data Operations Loop

Users can maintain local state.

Required actions:

- Re-index/rebuild derived objects.
- Clear local data.
- Export context bundle.
- Open database/storage path.

Rules:

- Clear local data must require confirmation.
- Re-index must be idempotent.
- Export must have a summary-only default.

## Required Audit Events

Write audit logs for:

- Source added/disabled.
- Ingestion started/finished/failed.
- Knowledge confirmed/rejected/archived/edited.
- Memory generated/confirmed/rejected/archived/edited.
- Recommendation accepted/dismissed/snoozed/resolved.
- Data cleared.
- Context exported.
- Settings changed.

## Alpha Acceptance

Alpha is ready when:

- A fresh user can install the app, configure at least one local source, ingest data, and see Today/Activity/Knowledge/Memory/Recommendation views.
- Review actions work from UI and CLI or local API.
- No Memory is included in default agent context until confirmed.
- Re-indexing does not duplicate Events or derived objects.
- The app exposes menu bar, launch-at-login, database path, source setup, data clear, re-index, and export settings.
- Tests cover the core review state transitions and Electron smoke path.
