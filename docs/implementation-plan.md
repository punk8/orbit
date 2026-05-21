# Implementation Plan

## Purpose

This document turns the current Orbit product, architecture, data model, privacy, milestone, and UI design notes into a concrete development plan.

The first implementation should prove Orbit as a local-first work context continuity system. It should not become a temporary MVP script, a screenshot search tool, or a Codex/SeaTalk-specific side project. The code should start with stable domain boundaries and leave clear room for screen, calendar, mail, Jira, GitLab, local files, MCP, and future automation.

For work beyond Alpha, use [Complete Product Spec](./complete-product-spec.md),
[Background Observation Core Spec](./background-observation-core-spec.md),
[Background Observation Implementation Plan](./background-observation-implementation-plan.md),
[Source Adapter Complete Contract](./source-adapter-complete-contract.md),
[Semantic Quality And Evaluation](./semantic-quality-evaluation.md), and
[Release Readiness Spec](./release-readiness-spec.md) as the fuller product baseline.

## Development North Star

Build the first usable path end to end:

```text
Background desktop observation / Codex / SeaTalk fixture or source input
  -> Source Adapter
  -> Event
  -> Activity Session
  -> Knowledge Artifact draft
  -> Memory candidate
  -> Recommendation candidate
  -> Desktop review / CLI query
```

The product is useful only when every generated summary, memory, and recommendation can explain its source.

## First Development Boundary

### In Scope

- TypeScript monorepo scaffold.
- Electron desktop shell scaffold.
- Local SQLite database with migrations.
- Core domain types matching `docs/data-model.md`.
- Local fixture ingestion for Codex and SeaTalk.
- Background observation runtime for authorized desktop activity.
- Desktop observation adapter for app/window/runtime events first.
- Codex adapter for read-only local session data.
- SeaTalk adapter interface and fixture-backed implementation.
- Deterministic Activity Session builder.
- Mock AI provider and provider interface.
- Knowledge Artifact draft generation from Activity Sessions.
- Memory candidate generation from confirmed Knowledge Artifacts.
- Recommendation candidate generation from follow-ups, blockers, and recurring signals.
- Review states for Knowledge, Memory, and Recommendations.
- CLI read commands for status, activity, knowledge, memory, and today's context.
- Electron UI with Today, Activity, Knowledge, Memory, Recommendations, Review Queue, Sources, and Settings.
- Permission and runtime controls for background observation.

### Out Of Scope

- Full raw screen recording as a default feature.
- OCR pipeline before screen permission, retention, redaction, and protected-app controls exist.
- Audio or meeting transcription before explicit permission, visible state, and short-retention policy exist.
- External side-effect automation.
- Sending SeaTalk messages.
- Modifying code through Orbit.
- Cloud sync.
- Hosted backend.
- Complex vector search as a hard dependency.

## Repository Shape

Create the repository as a pnpm workspace:

```text
apps/
  desktop/
    electron main process
    renderer app
    preload bridge
  cli/
    orbit command line interface
packages/
  core/
    domain types
    use cases
    pipeline orchestration
  db/
    sqlite connection
    schema
    migrations
    repositories
  adapters/
    source adapter interface
    codex adapter
    seatalk adapter
    fixture adapter
  ai/
    provider interfaces
    mock provider
    prompt contracts
  privacy/
    permission scopes
    redaction
    retention policy checks
  agent-api/
    local service client
    future MCP surface
  ui/
    shared React components
fixtures/
  codex/
  seatalk/
  expected/
docs/
```

The package names should make boundaries obvious even if some implementation starts simple.

## Stack Decisions

- Language: TypeScript.
- Package manager: pnpm.
- Desktop: Electron.
- Renderer: React + Vite.
- Database: SQLite with WAL mode and FTS5.
- SQL layer: Kysely or Drizzle. Prefer Kysely if SQL migrations need to stay explicit; prefer Drizzle if schema-first typing is more valuable.
- Tests: Vitest for packages, Playwright for Electron UI smoke tests.
- Formatting and linting: ESLint + Prettier.
- CLI: Node-based CLI using the same domain and db packages.
- AI provider: interface first, mock provider first, real provider later.

## Database Baseline

Implement these tables in the first migration:

- `sources`
- `source_cursors`
- `events`
- `activity_sessions`
- `activity_event_links`
- `knowledge_artifacts`
- `knowledge_sources`
- `memories`
- `memory_sources`
- `recommendations`
- `recommendation_sources`
- `audit_logs`
- `settings`
- `fts_knowledge`
- `fts_memory`

Required DB rules:

- Use stable string IDs.
- Use `schema_version` on domain objects.
- Use append-oriented Events.
- Store source pointers on all Events.
- Store evidence links for derived objects.
- Keep raw payload optional.
- Store privacy and retention fields explicitly.
- Use WAL mode.
- Deleting a source object must update relationship rows and FTS sidecars.

## Local Storage Layout

Use this default local data root:

```text
~/Library/Application Support/Orbit/
  orbit.db
  artifacts/
    knowledge/
    memory/
  raw/
  indexes/
  logs/
```

For development and tests, allow `ORBIT_HOME` to override this path.

## Fixtures

Before real ingestion, create a small fixture set:

- `fixtures/codex/day-1.jsonl`: one engineering session with commands, code changes, test result, and conclusion.
- `fixtures/codex/day-2.jsonl`: a second session that references a related issue.
- `fixtures/seatalk/day-1.jsonl`: a private chat, a group discussion, and one mention.
- `fixtures/seatalk/day-2.jsonl`: a follow-up discussion that connects to a Codex session.
- `fixtures/expected/activity-sessions.json`: expected grouped sessions.
- `fixtures/expected/knowledge-artifacts.json`: expected draft artifacts.
- `fixtures/expected/memories.json`: expected memory candidates.
- `fixtures/expected/recommendations.json`: expected recommendation candidates.

Fixture content must be synthetic or sanitized. Do not depend on private local user data for tests.

## Adapter Contracts

Each adapter must implement:

```ts
interface SourceAdapter {
  id: string;
  kind: SourceKind;
  displayName: string;
  capabilities: SourceCapability[];
  defaultSensitivity: Sensitivity;
  readCursor(cursor?: string): Promise<AdapterReadResult>;
}
```

Adapter responsibilities:

- Read incrementally.
- Normalize to Event.
- Preserve source pointer.
- Produce deterministic Event IDs or stable hashes.
- Avoid summarization or domain reasoning.
- Declare sensitivity defaults and permission scope.

Initial adapters:

- Fixture adapter: primary for tests.
- Codex adapter: reads local Codex session JSONL files.
- SeaTalk adapter: fixture-backed first; real integration waits until the available source path/API is clear.

## Pipeline Phases

### Phase 1: Event Ingestion

Input: adapter read result.

Output: normalized Events.

Acceptance:

- Duplicate input does not create duplicate Events.
- Event hash changes when meaningful content changes.
- Source pointer is never empty.
- Privacy metadata is present.

### Phase 2: Activity Session Builder

Input: Events.

Output: Activity Sessions.

Rules for first implementation:

- Group by time window.
- Prefer shared project/repository/thread/conversation.
- Keep source overlap and app overlap as grouping signals.
- Do not require AI classification.
- Allow sessions to be rebuilt from Events.

Acceptance:

- Fixture Events produce expected Activity Sessions.
- Each session has evidence references.
- Session details can list linked Events.

### Phase 3: Knowledge Draft Generator

Input: Activity Session or day window.

Output: Knowledge Artifact draft.

First implementation:

- Use mock provider to produce stable Markdown.
- Generate daily brief and debugging note types first.
- Attach source session IDs and evidence.
- Status starts as `draft` or `needs_review`.

Acceptance:

- Draft has title, metadata, description, key insights, follow-ups, evidence, and confidence.
- User can confirm, reject, archive, or edit through domain API.

### Phase 4: Memory Candidate Generator

Input: confirmed Knowledge Artifact.

Output: Memory candidates.

Rules:

- Do not write all Knowledge into Memory.
- Extract compact, durable points only.
- Status starts as `needs_review`.
- Memory has scope, kind, confidence, tags, and evidence.

Acceptance:

- Confirmed Knowledge can produce one or more candidate Memories.
- Rejected candidates are not searchable as active memory.
- Deleting Memory removes FTS sidecar.

### Phase 5: Recommendation Candidate Generator

Input: Events, Activity Sessions, Knowledge, Memory.

Output: Recommendation candidates.

First recommendation types:

- Follow-up.
- Blocker.
- Risk.
- Context needed.
- Recurring pattern.

Acceptance:

- Recommendation includes explanation, suggested action, confidence, impact, and evidence.
- No recommendation performs side effects.
- User can dismiss, snooze, accept, or resolve.

## CLI Surface

Build CLI before or alongside UI because it gives agents and tests a stable interface.

Required commands:

```text
orbit status
orbit source list
orbit ingest fixtures
orbit ingest codex --path <path>
orbit activity list --date <YYYY-MM-DD>
orbit activity show <id>
orbit knowledge list
orbit knowledge show <id>
orbit knowledge search <query>
orbit memory list
orbit memory search <query>
orbit recommendation list
orbit context today
orbit db path
```

CLI rules:

- Read commands are safe by default.
- Write commands must be explicit.
- Output should support human text and `--json`.
- Do not print raw sensitive payloads by default.

## Electron UI Scope

Follow `docs/ui-design.md` for the first desktop shell.

### Main Navigation

- Today
- Activity
- Knowledge
- Memory
- Recommendations
- Review Queue
- Sources
- Settings

### Shell Requirements

- macOS menu bar / tray icon.
- Active, paused, processing, needs permission, and error states.
- Open main window.
- Pause/resume capture.
- Local status bar.
- Settings for sources, retention, local storage, and AI provider.

### Page Requirements

Today:

- Current local status.
- Daily summary.
- Recent Activity Sessions.
- Review queue count.
- Recommendation list.

Activity:

- Date/source/project filters.
- Activity Session list.
- Detail inspector with evidence and derived objects.

Knowledge:

- Artifact list.
- Detail view with metadata, description, key insights, decisions, follow-ups, source sessions.
- Confirm/edit/reject/archive actions.

Memory:

- Memory list and search.
- Grouping by kind/project/status.
- Candidate confirmation flow.
- Evidence and version metadata.

Recommendations:

- Suggestion cards.
- Evidence expansion.
- Snooze/dismiss/resolve/accept states.

Review Queue:

- Knowledge drafts.
- Memory candidates.
- Recommendation candidates.
- Redaction warnings.
- Permission warnings.

Sources:

- Codex and SeaTalk source status.
- Permission scope.
- Last cursor.
- Last ingestion result.
- Pause/enable controls.

Settings:

- Orbit home path.
- Retention policies.
- AI provider state.
- Index rebuild.
- Export/delete controls.

## Privacy And Permission Requirements

Implement these in the first code cycle:

- Source permission scope model.
- Sensitivity enum.
- Redaction utility for common secrets.
- AI usage audit log model, even if real provider is not enabled yet.
- Raw payload policy flag per source.
- Pause/disable adapter state.
- Delete object use case.

Initial redaction patterns:

- API keys and tokens.
- Authorization headers.
- Password-like assignments.
- Private key blocks.
- Access cookies.

If redaction fails for a sensitive event, raw payload should not be persisted.

## Test Plan

### Unit Tests

- Domain type validation.
- Event ID/hash generation.
- Redaction.
- Adapter normalization.
- Activity Session grouping.
- Knowledge draft generation with mock provider.
- Memory candidate generation.
- Recommendation generation.
- State transitions.

### Integration Tests

- Ingest fixtures into SQLite.
- Re-run ingestion and verify idempotency.
- Build Activity Sessions.
- Generate Knowledge draft.
- Confirm Knowledge.
- Generate Memory candidates.
- Confirm Memory.
- Generate Recommendations.
- Search Knowledge and Memory through FTS.
- Delete source Event and verify evidence state and indexes.

### CLI Tests

- `orbit status`
- `orbit ingest fixtures`
- `orbit activity list --json`
- `orbit context today --json`
- `orbit memory search --json`

### UI Smoke Tests

- Electron launches.
- Main navigation renders.
- Fixture data appears in Today.
- Activity detail opens.
- Knowledge detail opens.
- Memory candidate confirm flow renders.
- Recommendation evidence expands.
- Sources and Settings render local status.

## Development Sequence

### Step 0: Scaffold

Deliverables:

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- workspace packages and app folders
- lint/test scripts

Exit criteria:

- `pnpm install`
- `pnpm test`
- `pnpm typecheck`

### Step 1: Core Types

Deliverables:

- domain types from `docs/data-model.md`
- ID/hash helpers
- state transition helpers
- evidence helpers

Exit criteria:

- type tests or unit tests prove valid object construction.

### Step 2: SQLite Store

Deliverables:

- migrations
- db connection
- repositories for Event, Activity, Knowledge, Memory, Recommendation
- FTS tables for Knowledge and Memory

Exit criteria:

- fixture objects can be inserted, queried, searched, and deleted.

### Step 3: Fixture Ingestion

Deliverables:

- fixture adapter
- synthetic fixtures
- ingestion pipeline
- idempotency tests

Exit criteria:

- `orbit ingest fixtures` loads deterministic Events.

### Step 4: Activity Builder

Deliverables:

- deterministic grouping rules
- session repository writes
- activity list/show use cases

Exit criteria:

- fixture Events produce expected Activity Sessions.

### Step 5: Knowledge And Memory

Deliverables:

- mock AI provider
- daily brief draft use case
- Knowledge review state changes
- Memory candidate extraction
- Memory confirm/reject flows

Exit criteria:

- confirmed Knowledge can produce searchable confirmed Memories.

### Step 6: Recommendations

Deliverables:

- recommendation candidate generator
- status transitions
- evidence expansion

Exit criteria:

- `orbit recommendation list` returns explainable suggestions with evidence.

### Step 7: CLI

Deliverables:

- CLI package
- safe read commands
- JSON output

Exit criteria:

- external agent can run `orbit context today --json` and get source-backed context.

### Step 8: Electron Shell

Deliverables:

- Electron main/preload/renderer scaffold
- local service or IPC bridge
- navigation and pages
- local status bar
- tray/menu state

Exit criteria:

- UI can inspect the same data loaded through CLI.

### Step 9: Codex Adapter

Deliverables:

- read-only session file discovery
- cursor persistence
- Event normalization
- adapter status in Sources UI

Exit criteria:

- real local Codex sessions can be ingested without private data leaking to test logs.

### Step 10: SeaTalk Adapter Decision

Deliverables:

- document actual available read path/API
- keep fixture-backed adapter if real path is unclear
- implement real adapter only after permissions and source format are confirmed

Exit criteria:

- no speculative SeaTalk scraping.

## Acceptance Criteria For First Usable Build

Orbit is ready for internal daily use when:

- It starts as an Electron macOS app.
- It stores data under `ORBIT_HOME` or Application Support.
- It can ingest fixture data and at least one real Codex source.
- It can show Today, Activity, Knowledge, Memory, Recommendations, Sources, and Settings.
- It can generate a traceable daily Knowledge draft.
- It can confirm a Memory candidate.
- It can show at least one recommendation with evidence.
- It can export today's context through CLI.
- It can pause sources.
- It can delete an object and clean indexes.
- No raw sensitive data is sent to external AI by default.

## Engineering Guardrails

- Keep adapters thin.
- Keep core independent from Electron.
- Keep AI providers behind interfaces.
- Keep writes auditable.
- Keep raw data optional.
- Keep generated objects traceable.
- Prefer deterministic rules before AI classification.
- Never make screenshot capture a hidden dependency.
- Do not add cloud or sync assumptions to the local data model.

## Immediate Next Task

The next coding task should be:

1. Scaffold the pnpm workspace.
2. Add TypeScript config, lint, and test baseline.
3. Create `packages/core` with domain types.
4. Create `packages/db` with an initial SQLite migration.
5. Create synthetic fixtures.
6. Add a CLI command that can ingest fixtures and print `orbit status`.

This gives the project a running spine before UI polish, real adapters, or AI provider work begins.
