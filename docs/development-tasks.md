# Development Tasks

## Purpose

This document breaks `docs/implementation-plan.md` into goal-sized development tasks.

Each task is written so a goal-mode agent can execute it without re-deciding product scope. The tasks intentionally start with the local data spine before real adapters, AI provider integration, or UI polish.

## Global Rules For Every Development Goal

- Follow `AGENTS.md` and do not reduce the implementation to a throwaway MVP.
- Keep the stable flow visible: `Source Adapter -> Event -> Activity Session -> Knowledge Artifact -> Memory -> Recommendation`.
- Keep `packages/core` independent from Electron.
- Keep adapters thin and read-only unless a later task explicitly adds writes.
- Do not build screen recording, OCR, audio transcription, cloud sync, hosted backend, or side-effect automation in these tasks.
- Do not read or depend on private local user data in tests.
- Use synthetic fixtures for repeatable tests.
- Do not send any raw data to external AI providers.
- Prefer deterministic logic and mock providers before real AI.
- Every derived object must keep evidence references.
- Every task must end with `pnpm test` and `pnpm typecheck` once those commands exist.

## Stack Defaults

Use these defaults unless a later decision explicitly changes them:

- Package manager: `pnpm`
- Language: TypeScript
- Desktop: Electron with React + Vite
- SQLite driver: `better-sqlite3`
- SQL layer: Kysely
- CLI: Commander
- Tests: Vitest
- UI smoke tests: Playwright
- Formatting/linting: Prettier + ESLint
- Local dev data root: `ORBIT_HOME`

## Task 1: Scaffold Workspace And Tooling

### Goal

Create the initial pnpm monorepo, TypeScript baseline, lint/test scripts, and empty package/app structure.

### Files To Create

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `.gitignore`
- `.npmrc`
- `.nvmrc`
- `apps/desktop/package.json`
- `apps/cli/package.json`
- `packages/core/package.json`
- `packages/db/package.json`
- `packages/adapters/package.json`
- `packages/ai/package.json`
- `packages/privacy/package.json`
- `packages/agent-api/package.json`
- `packages/ui/package.json`
- basic `src/index.ts` entrypoints for packages

### Implementation Notes

- Use Node LTS compatible with current local environment.
- Add workspace scripts:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm lint`
  - `pnpm format`
- Use project references only if they do not slow down the first scaffold.
- Keep package names scoped and stable, for example `@orbit/core`.

### Do Not Do

- Do not implement domain logic yet.
- Do not add Electron UI code beyond an empty app package.
- Do not add real adapters.

### Acceptance Commands

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm lint
```

### Done When

- All workspace packages resolve.
- All baseline scripts pass.
- Importing package entrypoints works in TypeScript.

## Task 2: Core Domain Types And State Helpers

### Goal

Implement domain types matching `docs/data-model.md`, plus stable ID/hash helpers and state transition helpers.

### Files To Create Or Modify

- `packages/core/src/types/common.ts`
- `packages/core/src/types/source.ts`
- `packages/core/src/types/event.ts`
- `packages/core/src/types/activity.ts`
- `packages/core/src/types/knowledge.ts`
- `packages/core/src/types/memory.ts`
- `packages/core/src/types/recommendation.ts`
- `packages/core/src/id.ts`
- `packages/core/src/hash.ts`
- `packages/core/src/state.ts`
- `packages/core/src/evidence.ts`
- `packages/core/src/index.ts`
- `packages/core/src/*.test.ts`

### Implementation Notes

- Keep schema version explicit.
- Use string literal unions from `docs/data-model.md`.
- Keep EvidenceRef reusable across all derived objects.
- Hash should be deterministic for normalized Event content.
- State helpers should reject invalid transitions.

### Do Not Do

- Do not import database code.
- Do not import Electron code.
- Do not add AI provider logic.

### Acceptance Commands

```bash
pnpm --filter @orbit/core test
pnpm typecheck
```

### Done When

- Domain objects can be constructed in tests.
- Invalid state transitions fail.
- Event hashes are stable for equivalent input.

## Task 3: SQLite Store And Initial Migration

### Goal

Add local SQLite storage, migrations, repositories, and FTS baseline.

### Files To Create Or Modify

- `packages/db/src/connection.ts`
- `packages/db/src/migrations/0001_initial.ts`
- `packages/db/src/migrate.ts`
- `packages/db/src/schema.ts`
- `packages/db/src/repositories/sourceRepository.ts`
- `packages/db/src/repositories/eventRepository.ts`
- `packages/db/src/repositories/activityRepository.ts`
- `packages/db/src/repositories/knowledgeRepository.ts`
- `packages/db/src/repositories/memoryRepository.ts`
- `packages/db/src/repositories/recommendationRepository.ts`
- `packages/db/src/repositories/auditRepository.ts`
- `packages/db/src/orbitHome.ts`
- `packages/db/src/index.ts`
- `packages/db/src/*.test.ts`

### Required Tables

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

### Implementation Notes

- Support `ORBIT_HOME`.
- Use WAL mode.
- Store raw payload separately or as nullable JSON only when policy allows.
- Make repositories return core domain objects, not DB-shaped rows.
- Add deletion paths that clean relationship rows and FTS entries.

### Do Not Do

- Do not implement real Codex or SeaTalk ingestion yet.
- Do not add vector search.
- Do not add cloud sync fields beyond stable IDs and timestamps.

### Acceptance Commands

```bash
pnpm --filter @orbit/db test
pnpm typecheck
```

### Done When

- A test DB can migrate from empty.
- Events, Activity Sessions, Knowledge, Memory, and Recommendations can be inserted and read back.
- Knowledge and Memory can be searched with FTS.
- Deleting objects cleans related sidecars.

## Task 4: Fixtures And Fixture Ingestion

### Goal

Create synthetic fixture data and an ingestion pipeline that converts fixture records into normalized Events.

### Files To Create Or Modify

- `fixtures/codex/day-1.jsonl`
- `fixtures/codex/day-2.jsonl`
- `fixtures/seatalk/day-1.jsonl`
- `fixtures/seatalk/day-2.jsonl`
- `fixtures/expected/events.json`
- `packages/adapters/src/sourceAdapter.ts`
- `packages/adapters/src/fixture/fixtureAdapter.ts`
- `packages/adapters/src/fixture/fixtureTypes.ts`
- `packages/core/src/ingestion/ingestEvents.ts`
- `packages/adapters/src/*.test.ts`

### Implementation Notes

- Fixture records should cover:
  - Codex engineering session
  - command execution
  - test result
  - code-change summary
  - SeaTalk private message
  - SeaTalk group discussion
  - mention / follow-up
- Use synthetic content only.
- Event IDs must be deterministic.
- Re-ingestion must be idempotent.

### Do Not Do

- Do not read real `~/.codex` data yet.
- Do not read real SeaTalk data.
- Do not call any AI provider.

### Acceptance Commands

```bash
pnpm --filter @orbit/adapters test
pnpm test
pnpm typecheck
```

### Done When

- Fixtures ingest into Events.
- Re-running ingestion creates no duplicates.
- Expected Event count and source pointers match tests.

## Task 5: First CLI Spine

### Goal

Create the CLI package with `orbit status` and fixture ingestion commands.

### Files To Create Or Modify

- `apps/cli/src/index.ts`
- `apps/cli/src/commands/status.ts`
- `apps/cli/src/commands/ingestFixtures.ts`
- `apps/cli/src/output.ts`
- `apps/cli/src/config.ts`
- `apps/cli/bin/orbit`
- CLI tests

### Required Commands

```text
orbit status
orbit db path
orbit ingest fixtures
```

### Implementation Notes

- Support `--json`.
- Respect `ORBIT_HOME`.
- Print local DB path, migration status, source count, event count, and last ingestion status.
- `orbit ingest fixtures` should run migration if needed.

### Do Not Do

- Do not expose raw fixture payloads by default.
- Do not add real source ingestion.
- Do not add UI code.

### Acceptance Commands

```bash
pnpm --filter @orbit/cli test
pnpm --filter @orbit/cli orbit status --json
pnpm --filter @orbit/cli orbit ingest fixtures
pnpm typecheck
```

### Done When

- A fresh `ORBIT_HOME` can be initialized through CLI.
- Fixtures can be ingested from CLI.
- Status reports counts correctly.

## Task 6: Activity Session Builder

### Goal

Implement deterministic Activity Session grouping and CLI read commands.

### Files To Create Or Modify

- `packages/core/src/activity/buildActivitySessions.ts`
- `packages/core/src/activity/groupingRules.ts`
- `packages/core/src/activity/activityUseCases.ts`
- `fixtures/expected/activity-sessions.json`
- `apps/cli/src/commands/activityList.ts`
- `apps/cli/src/commands/activityShow.ts`
- tests for grouping and CLI output

### Required Commands

```text
orbit activity list --date <YYYY-MM-DD>
orbit activity show <id>
```

### Implementation Notes

- Group by time proximity, project/repository/thread, source overlap, and app overlap.
- Keep grouping reproducible from Events.
- Store session evidence.
- Record event count, source kinds, apps, project, and sensitivity.

### Do Not Do

- Do not use AI classification yet.
- Do not create Knowledge automatically from every session.

### Acceptance Commands

```bash
pnpm test
pnpm --filter @orbit/cli orbit activity list --json
pnpm typecheck
```

### Done When

- Fixture Events produce expected Activity Sessions.
- Activity detail shows linked Events and evidence pointers.

## Task 7: Knowledge Drafts And Review States

### Goal

Generate traceable Knowledge Artifact drafts from Activity Sessions using a mock AI provider.

### Files To Create Or Modify

- `packages/ai/src/provider.ts`
- `packages/ai/src/mockProvider.ts`
- `packages/core/src/knowledge/draftKnowledgeArtifact.ts`
- `packages/core/src/knowledge/knowledgeUseCases.ts`
- `fixtures/expected/knowledge-artifacts.json`
- `apps/cli/src/commands/knowledgeList.ts`
- `apps/cli/src/commands/knowledgeShow.ts`
- `apps/cli/src/commands/knowledgeSearch.ts`
- tests for Knowledge draft generation and review transitions

### Required Commands

```text
orbit knowledge list
orbit knowledge show <id>
orbit knowledge search <query>
```

### Implementation Notes

- Start with `daily_brief` and `debugging_note`.
- Status starts as `draft` or `needs_review`.
- Include metadata, description, key insights, follow-ups, evidence, confidence.
- FTS should search title and Markdown content.

### Do Not Do

- Do not call a real AI provider.
- Do not auto-confirm Knowledge.
- Do not write Memory directly from Knowledge.

### Acceptance Commands

```bash
pnpm test
pnpm --filter @orbit/cli orbit knowledge list --json
pnpm typecheck
```

### Done When

- A fixture day can produce a traceable Knowledge draft.
- Knowledge can be confirmed, rejected, archived, and searched.

## Task 8: Memory Candidates

### Goal

Create Memory candidates from confirmed Knowledge Artifacts and add review/confirm/search flows.

### Files To Create Or Modify

- `packages/core/src/memory/extractMemoryCandidates.ts`
- `packages/core/src/memory/memoryUseCases.ts`
- `fixtures/expected/memories.json`
- `apps/cli/src/commands/memoryList.ts`
- `apps/cli/src/commands/memorySearch.ts`
- tests for Memory extraction, confirmation, rejection, and FTS cleanup

### Required Commands

```text
orbit memory list
orbit memory search <query>
```

### Implementation Notes

- Generate compact, durable points only.
- Status starts as `needs_review`.
- Include kind, scope, tags, confidence, and evidence.
- Confirmed memories become searchable.
- Rejected candidates do not appear in active Memory search.

### Do Not Do

- Do not turn entire Knowledge markdown into Memory.
- Do not auto-confirm Memory.
- Do not add embedding/vector dependency yet.

### Acceptance Commands

```bash
pnpm test
pnpm --filter @orbit/cli orbit memory search "fixture" --json
pnpm typecheck
```

### Done When

- Confirmed Knowledge can produce Memory candidates.
- Confirmed Memory is searchable.
- Deleting Memory cleans FTS.

## Task 9: Recommendation Candidates

### Goal

Generate explainable Recommendation candidates from fixture Activity, Knowledge, and Memory.

### Files To Create Or Modify

- `packages/core/src/recommendation/generateRecommendations.ts`
- `packages/core/src/recommendation/recommendationUseCases.ts`
- `fixtures/expected/recommendations.json`
- `apps/cli/src/commands/recommendationList.ts`
- tests for recommendation generation and status transitions

### Required Commands

```text
orbit recommendation list
```

### Implementation Notes

- Support follow-up, blocker, risk, context needed, and recurring pattern.
- Include explanation, suggested action, confidence, impact, status, and evidence.
- Add status transitions for dismiss, snooze, accept, and resolve.

### Do Not Do

- Do not execute side effects.
- Do not send messages or create external tasks.
- Do not generate recommendations without evidence.

### Acceptance Commands

```bash
pnpm test
pnpm --filter @orbit/cli orbit recommendation list --json
pnpm typecheck
```

### Done When

- Recommendations are source-backed and explainable.
- User state transitions work.

## Task 10: Today Context CLI

### Goal

Expose a read-only context command external agents can use.

### Files To Create Or Modify

- `packages/core/src/context/todayContext.ts`
- `packages/core/src/context/projectContext.ts`
- `apps/cli/src/commands/contextToday.ts`
- `apps/cli/src/commands/contextProject.ts`
- tests for context output shape

### Required Commands

```text
orbit context today
orbit context today --json
orbit context project <name>
```

### Implementation Notes

- Include Activity summary, Knowledge drafts/confirmed artifacts, confirmed Memories, and Recommendations.
- Include evidence IDs and source pointers.
- Do not include raw sensitive payloads.
- Make output concise enough for agent context injection.

### Do Not Do

- Do not add MCP yet.
- Do not write Memory from this command.
- Do not include raw chat/message bodies by default.

### Acceptance Commands

```bash
pnpm test
pnpm --filter @orbit/cli orbit context today --json
pnpm typecheck
```

### Done When

- An external agent can retrieve today's source-backed context from CLI.

## Task 11: Electron Shell Scaffold

### Goal

Build the first Electron shell that can render local data already available through CLI.

### Files To Create Or Modify

- `apps/desktop/electron/main.ts`
- `apps/desktop/electron/preload.ts`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/routes/*`
- `apps/desktop/src/components/*`
- `apps/desktop/src/ipc/*`
- `packages/ui/src/*`
- desktop tests or smoke test setup

### Required Pages

- Today
- Activity
- Knowledge
- Memory
- Recommendations
- Review Queue
- Sources
- Settings

### Implementation Notes

- Use a workbench layout with left navigation, main content, optional inspector, and status bar.
- Display local DB/index/source status.
- Renderer should access data through IPC, not direct DB imports.
- Keep UI functional and information-dense.
- Use existing `docs/ui-design.md` as the product reference.

### Do Not Do

- Do not add screen recording.
- Do not add real external AI settings beyond disabled/config placeholder.
- Do not add destructive delete UI unless backend delete use cases are already tested.

### Acceptance Commands

```bash
pnpm --filter @orbit/desktop typecheck
pnpm test
pnpm typecheck
```

### Done When

- Electron app launches.
- Navigation renders all required pages.
- Fixture data appears in Today, Activity, Knowledge, Memory, and Recommendations.

## Task 12: Codex Adapter

### Goal

Implement a read-only Codex adapter for local session files after the local pipeline is proven with fixtures.

### Files To Create Or Modify

- `packages/adapters/src/codex/codexAdapter.ts`
- `packages/adapters/src/codex/codexSessionReader.ts`
- `packages/adapters/src/codex/codexNormalizer.ts`
- Codex adapter tests with sanitized fixture session files
- CLI option for `orbit ingest codex --path <path>`

### Implementation Notes

- Default path can be configurable.
- Use cursor persistence.
- Normalize sessions, commands, test results, code-change summaries, and conclusions.
- Keep source pointers.
- Do not log raw private session content in tests.

### Do Not Do

- Do not mutate Codex files.
- Do not depend on private local data for tests.
- Do not infer business conclusions inside the adapter.

### Acceptance Commands

```bash
pnpm test
pnpm --filter @orbit/cli orbit ingest codex --path <sanitized-fixture-path>
pnpm typecheck
```

### Done When

- Sanitized Codex fixtures ingest into Events.
- Real local Codex ingestion is possible through an explicit path.

## Task 13: SeaTalk Adapter Decision And Safe Interface

### Goal

Document the real SeaTalk read path and implement only the safe adapter shape that current permissions support.

### Files To Create Or Modify

- `docs/seatalk-adapter-notes.md`
- `packages/adapters/src/seatalk/seatalkAdapter.ts`
- `packages/adapters/src/seatalk/seatalkNormalizer.ts`
- sanitized fixture tests

### Implementation Notes

- If a stable local/API read path is unavailable, keep the adapter fixture-backed and document the blocker.
- Treat SeaTalk sensitivity as conservative by default.
- Normalize messages, mentions, private chats, group discussions, and on-call events only from approved inputs.

### Do Not Do

- Do not scrape private data speculatively.
- Do not send or reply to messages.
- Do not bypass app permissions.

### Acceptance Commands

```bash
pnpm test
pnpm typecheck
```

### Done When

- The SeaTalk integration path is explicit.
- No speculative or unsafe read behavior exists.

## Three Development Goals

Use these three goals to execute implementation. Do not combine all tasks into one long goal unless the user explicitly asks to trade away checkpoints.

### Goal 1: Local Data Spine

Scope: Task 1-5.

Expected deliverables:

- pnpm monorepo scaffold.
- TypeScript, lint, and test baseline.
- `packages/core` domain types, ID/hash helpers, state helpers, and evidence helpers.
- `packages/db` SQLite migration, repositories, FTS baseline, and `ORBIT_HOME` support.
- synthetic Codex and SeaTalk fixtures.
- fixture adapter and idempotent fixture ingestion.
- CLI commands:
  - `orbit status`
  - `orbit db path`
  - `orbit ingest fixtures`

Acceptance commands:

```bash
pnpm install
pnpm lint
pnpm test
pnpm typecheck
pnpm --filter @orbit/cli orbit status --json
pnpm --filter @orbit/cli orbit ingest fixtures
pnpm --filter @orbit/cli orbit status --json
```

Functional acceptance:

- A fresh `ORBIT_HOME` can initialize the local database.
- Fixtures can be normalized into standard Events.
- Repeated fixture ingestion does not create duplicate Events.
- SQLite schema includes the core tables from `docs/implementation-plan.md`.
- CLI reports source and event counts.
- Core package has no Electron dependency.
- No real Codex or SeaTalk private data is read.
- No external AI provider is called.
- Electron is only scaffolded as an empty package.

Goal 1 prompt:

```text
Implement Orbit Task 1-5 from docs/development-tasks.md.

Scope:
- Scaffold the pnpm TypeScript workspace.
- Add package/app structure.
- Implement core domain types and state/hash/evidence helpers.
- Implement initial SQLite store and migration.
- Add synthetic Codex/SeaTalk fixtures.
- Add fixture ingestion.
- Add CLI commands: orbit status, orbit db path, orbit ingest fixtures.

Constraints:
- Follow AGENTS.md.
- Do not implement Electron UI beyond empty package scaffold.
- Do not implement real Codex or SeaTalk adapters.
- Do not read private local data.
- Do not call external AI.
- Keep core independent from Electron.
- End with pnpm install, pnpm test, pnpm typecheck, and a short summary of files changed.
```

### Goal 2: Semantic Pipeline

Scope: Task 6-10.

Expected deliverables:

- deterministic Activity Session builder.
- Activity list/show CLI commands.
- mock AI provider.
- Knowledge Artifact draft generation and review states.
- Memory candidate extraction and review states.
- Recommendation candidate generation and status transitions.
- Today/project context CLI commands for external agents.
- FTS-backed Knowledge and Memory search.

Acceptance commands:

```bash
pnpm test
pnpm typecheck
pnpm --filter @orbit/cli orbit ingest fixtures
pnpm --filter @orbit/cli orbit activity list --json
pnpm --filter @orbit/cli orbit knowledge list --json
pnpm --filter @orbit/cli orbit memory list --json
pnpm --filter @orbit/cli orbit recommendation list --json
pnpm --filter @orbit/cli orbit context today --json
```

Functional acceptance:

- Fixture Events can be grouped into Activity Sessions.
- Activity Sessions trace back to source Events.
- Knowledge Artifact drafts can be generated from Activity Sessions.
- Knowledge supports `draft`, `confirmed`, `rejected`, and `archived` states.
- Confirmed Knowledge can produce Memory candidates.
- Memory candidates are not auto-confirmed.
- Confirmed Memory is searchable.
- Recommendations include explanation, suggested action, confidence, impact, and evidence.
- `orbit context today --json` returns concise source-backed context suitable for agent injection.
- Only the mock AI provider is used.
- No side-effect action is executed.

Goal 2 prompt:

```text
Implement Orbit Task 6-10 from docs/development-tasks.md.

Scope:
- Build deterministic Activity Session grouping.
- Add Activity list/show use cases and CLI commands.
- Add mock AI provider.
- Generate traceable Knowledge Artifact drafts.
- Add Knowledge review states.
- Generate Memory candidates from confirmed Knowledge.
- Add Memory review/search flows.
- Generate explainable Recommendation candidates.
- Add orbit context today and orbit context project CLI commands.

Constraints:
- Follow AGENTS.md.
- Do not implement Electron UI.
- Do not implement real Codex or SeaTalk adapters.
- Do not read private local data.
- Do not call external AI; use only the mock provider.
- Do not execute side effects.
- Every derived object must include evidence references.
- End with pnpm test, pnpm typecheck, all Goal 2 acceptance commands, and a short summary of files changed.
```

### Goal 3: Product Shell And Real Sources

Scope: Task 11-13.

Expected deliverables:

- Electron desktop shell.
- Today, Activity, Knowledge, Memory, Recommendations, Review Queue, Sources, and Settings pages.
- IPC bridge or local service connecting renderer to the existing local data APIs.
- local status bar and source status surface.
- read-only Codex adapter for explicit local session paths.
- SeaTalk adapter decision notes and safe adapter interface.

Acceptance commands:

```bash
pnpm test
pnpm typecheck
pnpm --filter @orbit/desktop typecheck
pnpm --filter @orbit/cli orbit ingest fixtures
pnpm --filter @orbit/cli orbit context today --json
```

Add this if Electron smoke tests exist:

```bash
pnpm --filter @orbit/desktop test:e2e
```

Functional acceptance:

- Electron app can launch.
- UI renders Today, Activity, Knowledge, Memory, Recommendations, Review Queue, Sources, and Settings.
- UI can display fixture data already available through CLI.
- Today shows summary, recent Activity, and Recommendations.
- Activity opens session detail and evidence.
- Knowledge opens artifact detail and review status.
- Memory shows candidates and confirmed memories.
- Recommendations can expand evidence.
- Sources shows Codex and SeaTalk status.
- Settings shows local storage, AI provider, and retention basics.
- Codex adapter is read-only and can ingest sanitized fixtures or an explicit user-provided path.
- Codex tests do not depend on private local data.
- SeaTalk is not implemented speculatively; if a safe read path is unclear, keep it fixture-backed and document the blocker.
- No screen recording, OCR, cloud sync, message sending, or side-effect automation is added.

Goal 3 prompt:

```text
Implement Orbit Task 11-13 from docs/development-tasks.md.

Scope:
- Build the Electron desktop shell.
- Add Today, Activity, Knowledge, Memory, Recommendations, Review Queue, Sources, and Settings pages.
- Connect the renderer to existing local data APIs through IPC or a local service.
- Add local status surfaces.
- Implement read-only Codex adapter for explicit paths and sanitized fixture tests.
- Document SeaTalk read-path decision in docs/seatalk-adapter-notes.md and implement only the safe adapter interface that current permissions support.

Constraints:
- Follow AGENTS.md.
- Do not implement screen recording, OCR, audio transcription, cloud sync, hosted backend, message sending, or external task creation.
- Do not read private local Codex data in tests.
- Do not scrape SeaTalk speculatively.
- Do not call external AI unless a previous goal explicitly added a safe provider setting, and keep it disabled by default.
- End with pnpm test, pnpm typecheck, desktop typecheck, available Electron smoke tests, and a short summary of files changed.
```

## Goal Sequencing

Recommended order:

1. Goal 1: Local Data Spine, Task 1-5.
2. Goal 2: Semantic Pipeline, Task 6-10.
3. Goal 3: Product Shell And Real Sources, Task 11-13.

This order keeps every goal independently verifiable and prevents UI or real data-source complexity from hiding core model issues.
