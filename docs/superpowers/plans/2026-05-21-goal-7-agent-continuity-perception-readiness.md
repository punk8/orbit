# Goal 7 Agent Continuity And Perception Readiness Implementation Plan

> Update: this completed Goal 7 plan intentionally stopped at perception readiness. Goal 8 now owns
> opt-in screen/OCR/vision/audio implementation through
> [Alpha Perception And Context Completion](../../alpha-perception-and-context-completion.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one combined Orbit development goal that delivers the first agent handoff product surface, hardens explicit-path Codex/local-agent ingestion, and records a permission-aware screen/audio perception research spike without implementing raw capture.

**Architecture:** Preserve Orbit's stable flow: `Source Adapter -> Event -> Activity Session -> Knowledge Artifact -> Memory -> Recommendation -> Handoff Pack`. Handoff Pack is a derived read-only view assembled from repositories and formatted for user-reviewed agent warm-starts; Codex/local-agent sources remain explicit-path only; screen/audio work adds research and disabled capability descriptors only.

**Tech Stack:** TypeScript, pnpm, Vitest, Commander CLI, Electron IPC/React, SQLite via `better-sqlite3`, existing `@orbit/core`, `@orbit/db`, `@orbit/adapters`, `@orbit/agent-api`, and `@orbit/desktop`.

---

## Product Scope

This is one implementation goal, not three separate phases. The goal is complete only when a user can ingest explicit-path Codex/local-agent data, run the semantic pipeline, generate privacy-safe Handoff Packs from CLI and Desktop, and see a documented screen/audio implementation path that does not yet capture screen or microphone data.

Handoff Pack is the shipped product surface for this goal. Real source hardening supports that surface. Perception research keeps the later screen/audio path aligned with the product boundary: first-class future inputs, not the product center.

## Non-Goals

- Do not implement screen recording, ScreenCaptureKit capture, OCR, Apple Vision processing, microphone capture, Whisper/transcription, or media storage.
- Do not scrape SeaTalk or add a new SeaTalk read path.
- Do not read `~/.codex`, chat logs, screen data, microphone data, or any private path unless the user supplies an explicit path to the command/UI.
- Do not send Handoff Pack content to external agents, cloud services, or other applications automatically.
- Do not add side-effect automation such as sending messages, creating tasks, changing code, or writing external files beyond Orbit's local DB/audit/docs.
- Do not include raw screenshots, recordings, transcripts, raw Event text, private messages, failed-redaction Events, draft Knowledge, unconfirmed Memory, or non-exportable source content in default handoffs.
- Do not make MCP the primary surface in this goal. CLI and Desktop review/copy must be complete first.

## Required Acceptance Commands

Run these before claiming Goal 7 is complete. Use a clean local Orbit home for CLI acceptance so no private user data participates in the result:

```bash
rm -rf .tmp/goal-7-acceptance
export ORBIT_HOME="$PWD/.tmp/goal-7-acceptance"
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/adapters test
pnpm --filter @orbit/cli orbit ingest fixtures --json
pnpm --filter @orbit/cli orbit ingest codex --path fixtures/codex-sessions --json
pnpm --filter @orbit/cli orbit ingest local-agent --path fixtures/realistic/local-agent --json
pnpm --filter @orbit/cli orbit pipeline run --json
pnpm --filter @orbit/cli orbit handoff today --json
pnpm --filter @orbit/cli orbit handoff today --format markdown
pnpm --filter @orbit/cli orbit handoff project orbit --json
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
pnpm --filter @orbit/desktop package:dir
pnpm rebuild better-sqlite3
pnpm --filter @orbit/cli orbit status --json
```

Run `pnpm --filter @orbit/desktop test:e2e` separately from `pnpm --filter @orbit/desktop package:dir`; both touch packaged app paths and can race if run in parallel. Run `pnpm rebuild better-sqlite3` after packaging because Electron packaging can leave the workspace native module built for the Electron ABI instead of the Node/CLI ABI.

## Functional Acceptance

- `orbit handoff today --json` returns a structured pack with objective, current state, recent Activity, confirmed Knowledge, active Memories, decisions, blockers/risks, Recommendations, safety boundaries, evidence index, and exclusions.
- `orbit handoff today --format markdown` returns readable Markdown suitable for user-reviewed pasting into a new Codex/Claude Code session.
- `orbit handoff project orbit --json` filters Activity/Knowledge/Memory/Recommendation records to the requested project.
- Default handoff output excludes draft Knowledge, unconfirmed Memory candidates, raw Event text, secret content, failed-redaction Events, and sources whose permission scope disallows agent export.
- Handoff generation writes local `handoff.generate` audit logs and performs no external side effects.
- Desktop exposes a user-visible Handoff page that generates, previews, and copies Markdown locally.
- Desktop handoff UI strings live in `apps/desktop/src/i18n.tsx` with English and Chinese values.
- Codex/local-agent adapters ingest only explicit local paths, report invalid/unsupported-file warnings, preserve stable source pointers, use deterministic file order, and remain cursor-idempotent.
- Real-source fixtures cover nested directories, invalid JSONL records, `.json` array records, multiple sessions, command/test/code-change records, and generic local agent records.
- Screen/audio research is committed in `docs/perception-research-spike.md` with recommended macOS APIs, permission UX, privacy rules, CPU/storage risks, disabled-first adapter shape, and a later implementation sequence.
- Screen/audio are represented as first-class future perception inputs in docs and as disabled capability descriptors in code, with no capture implementation.
- SeaTalk remains approved-import-only.

## File Map

- Create `packages/core/src/handoff/handoffPack.ts`
  - Handoff Pack domain types, build input, privacy filters, evidence index assembly, deterministic IDs.
- Create `packages/core/src/handoff/formatHandoff.ts`
  - Markdown formatter and JSON-safe serialization helper.
- Create `packages/core/src/handoff/handoffPack.test.ts`
  - Pure tests for inclusion, exclusion, evidence dedupe, deterministic IDs, and Markdown output.
- Create `packages/core/src/perception/perceptionCapabilities.ts`
  - Disabled descriptors for future screen/audio perception inputs.
- Create `packages/core/src/perception/perceptionCapabilities.test.ts`
  - Tests proving descriptors are disabled and non-capturing.
- Modify `packages/core/src/types/common.ts`
  - Add `"audio"` to `SourceKind`.
- Modify `packages/core/src/index.ts`
  - Export handoff and perception helpers.
- Create `packages/db/src/handoffPack.ts`
  - Repository assembly from SQLite records and audit logging.
- Create `packages/db/src/handoffPack.test.ts`
  - Integration tests for today/project handoffs, confirmed-only rules, source policy filtering, and audit logs.
- Modify `packages/db/src/index.ts`
  - Export DB handoff assembly.
- Create `apps/cli/src/commands/handoff.ts`
  - CLI helpers for today/project JSON/Markdown handoff output.
- Modify `apps/cli/src/index.ts`
  - Add `orbit handoff today` and `orbit handoff project <name>`.
- Modify `apps/cli/src/cli.test.ts`
  - Cover CLI handoff helpers and command registration.
- Modify `packages/adapters/src/codex/codexSessionReader.ts`
  - Harden deterministic traversal, warnings, and JSON/JSONL reading where tests expose gaps.
- Modify `packages/adapters/src/codex/codexAdapter.ts`
  - Preserve explicit-path cursor/idempotency behavior.
- Modify `packages/adapters/src/localAgent/localAgentAdapter.ts`
  - Preserve explicit-path cursor/idempotency behavior.
- Modify `packages/adapters/src/codexAdapter.test.ts`
  - Add nested path, warning, pointer, and cursor coverage.
- Modify `packages/adapters/src/localAgentAdapter.test.ts`
  - Add nested path, warning, pointer, and cursor coverage.
- Add `fixtures/realistic/codex/nested/orbit-child-session.json`
  - Synthetic `.json` array fixture.
- Add `fixtures/realistic/local-agent/nested/agent-child-session.json`
  - Synthetic `.json` array fixture.
- Add `fixtures/realistic/local-agent/malformed.jsonl`
  - Synthetic warning fixture.
- Modify `apps/desktop/electron/data.ts`
  - Add local handoff generation action.
- Modify `apps/desktop/electron/main.ts`
  - Add IPC handler for handoff generation.
- Modify `apps/desktop/electron/preload.ts`
  - Expose `generateHandoff`.
- Modify `apps/desktop/electron/preload.test.ts`
  - Assert preload exposes handoff generation.
- Modify `apps/desktop/src/orbitApi.ts`
  - Add handoff types/action result.
- Modify `apps/desktop/src/App.tsx`
  - Add Handoff navigation and route.
- Create `apps/desktop/src/routes/HandoffPage.tsx`
  - Handoff review/copy UI.
- Create `apps/desktop/src/routes/HandoffPage.test.ts`
  - Static smoke test for route labels/actions/i18n keys.
- Modify `apps/desktop/src/i18n.tsx`
  - English and Chinese handoff strings.
- Modify `packages/agent-api/src/index.ts`
  - Add read-only handoff resource descriptor builders.
- Create `packages/agent-api/src/index.test.ts`
  - Test descriptor output.
- Create `docs/perception-research-spike.md`
  - Research findings, product constraints, and production-capture gate.
- Modify `docs/product-principles.md`
  - Link perception positioning to Handoff-first product center.
- Modify `docs/architecture.md`
  - Document Handoff Pack and future perception adapter placement.
- Modify `docs/README.md`
  - Link the perception research document.
- Modify `docs/handoff-next-development.md`
  - Update continuation notes after Goal 7 implementation.
- Modify `docs/milestone-plan.md`
  - Align milestone ordering with Handoff-first combined Goal 7.
- Modify `docs/handoff-pack.md`
  - Update only if implementation details differ from the current spec.

## Data Model: Handoff Pack

Implement the pack as a derived object, not a persisted table:

```ts
export interface HandoffPack {
  schemaVersion: 1;
  id: string;
  kind: "today" | "project";
  objective: string;
  generatedAt: string;
  date?: string;
  project?: string;
  currentState: string[];
  recentActivity: HandoffActivityItem[];
  confirmedKnowledge: HandoffKnowledgeItem[];
  activeMemories: HandoffMemoryItem[];
  decisions: HandoffDecisionItem[];
  blockersAndRisks: HandoffRiskItem[];
  recommendedNextActions: HandoffRecommendationItem[];
  safetyBoundaries: HandoffSafetyBoundary[];
  evidenceIndex: HandoffEvidenceItem[];
  excluded: HandoffExclusion[];
}
```

Builder input must include Event-level safety metadata so the pure builder can exclude unsafe records without reading raw Events:

```ts
export interface HandoffEventSafety {
  eventId: string;
  sourceAdapterId: string;
  sourceKind: SourceKind;
  sourcePointer: string;
  timestamp: string;
  sensitivity: Sensitivity;
  redactionState: "none" | "redacted" | "failed";
  canExportToAgent: boolean;
}
```

Evidence IDs should be deterministic for tests by hashing `kind`, `date` or `project`, object IDs, and source pointers. Handoff v1 must not include `Event.content.text`, raw screenshots, raw audio, raw transcripts, or unreviewed evidence excerpts. Evidence items may include source kind, pointer, timestamp, object type, object ID, and confidence metadata.

## Task 1: Core Handoff Pack Builder

**Files:**

- Create `packages/core/src/handoff/handoffPack.ts`
- Create `packages/core/src/handoff/formatHandoff.ts`
- Create `packages/core/src/handoff/handoffPack.test.ts`
- Modify `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests for default inclusion rules**

Create `packages/core/src/handoff/handoffPack.test.ts` with in-memory fixtures for Activity, Knowledge, Memory, Recommendations, and Event safety. The first test must prove confirmed and exportable objects are included:

```ts
it("builds a default today handoff from confirmed and evidence-backed objects", () => {
  const pack = buildHandoffPack({
    kind: "today",
    objective: "Continue Orbit development",
    date: "2026-05-21",
    generatedAt: "2026-05-21T08:00:00.000Z",
    activitySessions: [makeActivity({ eventIds: ["evt_1"] })],
    knowledgeArtifacts: [makeKnowledge({ status: "confirmed", eventId: "evt_1" })],
    memories: [makeMemory({ status: "confirmed", eventId: "evt_1" })],
    recommendations: [makeRecommendation({ status: "new", eventId: "evt_1" })],
    eventSafety: new Map([["evt_1", makeEventSafety({ eventId: "evt_1" })]])
  });

  expect(pack.kind).toBe("today");
  expect(pack.recentActivity).toHaveLength(1);
  expect(pack.confirmedKnowledge).toHaveLength(1);
  expect(pack.activeMemories).toHaveLength(1);
  expect(pack.recommendedNextActions).toHaveLength(1);
  expect(pack.evidenceIndex.length).toBeGreaterThan(0);
  expect(JSON.stringify(pack)).not.toContain("RAW_EVENT_TEXT");
});
```

The second test must prove default safety exclusions:

```ts
it("excludes draft, unconfirmed, failed-redaction, secret, and non-exportable evidence", () => {
  const pack = buildHandoffPack({
    kind: "today",
    objective: "Continue Orbit development",
    date: "2026-05-21",
    generatedAt: "2026-05-21T08:00:00.000Z",
    activitySessions: [
      makeActivity({ id: "act_secret", eventIds: ["evt_secret"] }),
      makeActivity({ id: "act_blocked", eventIds: ["evt_blocked"] })
    ],
    knowledgeArtifacts: [makeKnowledge({ status: "draft", eventId: "evt_ok" })],
    memories: [makeMemory({ status: "needs_review", eventId: "evt_ok" })],
    recommendations: [makeRecommendation({ status: "new", eventId: "evt_failed" })],
    eventSafety: new Map([
      ["evt_ok", makeEventSafety({ eventId: "evt_ok" })],
      ["evt_secret", makeEventSafety({ eventId: "evt_secret", sensitivity: "secret" })],
      ["evt_blocked", makeEventSafety({ eventId: "evt_blocked", canExportToAgent: false })],
      ["evt_failed", makeEventSafety({ eventId: "evt_failed", redactionState: "failed" })]
    ])
  });

  expect(pack.recentActivity).toHaveLength(0);
  expect(pack.confirmedKnowledge).toHaveLength(0);
  expect(pack.activeMemories).toHaveLength(0);
  expect(pack.recommendedNextActions).toHaveLength(0);
  expect(pack.excluded.map((item) => item.reason)).toEqual(
    expect.arrayContaining([
      "draft_knowledge",
      "memory_not_confirmed",
      "secret_content",
      "failed_redaction",
      "source_export_blocked"
    ])
  );
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm exec vitest run packages/core/src/handoff/handoffPack.test.ts
```

Expected: FAIL because handoff builder and formatter do not exist.

- [ ] **Step 3: Implement builder and types**

Implement `buildHandoffPack(input)` with:

- deterministic pack ID using `stableHash` or existing hash helper,
- Activity inclusion only when every referenced Event safety record is exportable, non-secret, and not failed-redaction,
- Knowledge inclusion only when `status === "confirmed"` and evidence is safe,
- Memory inclusion only when `status === "confirmed"` and evidence is safe,
- Recommendation inclusion only when status is `new`, `accepted`, or `snoozed`, evidence exists, and evidence is safe,
- decisions from confirmed Knowledge `content.decisions` and Memory kind `"decision"`,
- blockers/risks from Knowledge blockers and Recommendation types `"risk"`/`"blocker"`/`"context_needed"`,
- safety boundaries that state no side effects, no raw payload export, source export policy applies, and user review is required before sharing,
- exclusion reasons `draft_knowledge`, `memory_not_confirmed`, `recommendation_terminal`, `missing_evidence`, `secret_content`, `failed_redaction`, and `source_export_blocked`.

- [ ] **Step 4: Add Markdown formatter tests**

Test `formatHandoffMarkdown(pack)` includes these headings and excludes raw fixture text:

```markdown
# Orbit Handoff

## Objective

## Current State

## Recent Activity

## Confirmed Knowledge

## Active Memories

## Decisions

## Blockers And Risks

## Recommended Next Actions

## Safety Boundaries

## Evidence Index
```

- [ ] **Step 5: Run core tests**

Run:

```bash
pnpm --filter @orbit/core test
pnpm typecheck
```

Expected: core tests and typecheck pass.

## Task 2: DB Assembly And Audit

**Files:**

- Create `packages/db/src/handoffPack.ts`
- Create `packages/db/src/handoffPack.test.ts`
- Modify `packages/db/src/index.ts`

- [ ] **Step 1: Write failing DB integration tests**

Create tests that seed an in-memory Orbit database using existing repositories. Cover:

- today handoff reads Activity, confirmed Knowledge, confirmed Memory, and active Recommendations,
- project handoff filters `ActivitySession.project`, `KnowledgeArtifact.metadata.projects`, `Memory.scope.project`, and Recommendation evidence related to the project,
- draft Knowledge and needs-review Memory are excluded,
- Events with `privacy.redactionState === "failed"` or `privacy.sensitivity === "secret"` block dependent objects,
- sources with `permissionScope.canExportToAgent === false` block dependent objects,
- audit log `handoff.generate` is written after successful generation,
- serialized pack does not contain seeded `Event.content.text` value `RAW_DB_EVENT_TEXT`.

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
pnpm exec vitest run packages/db/src/handoffPack.test.ts
```

Expected: FAIL because DB handoff assembly does not exist.

- [ ] **Step 3: Implement DB assembly**

Create functions in `packages/db/src/handoffPack.ts`:

```ts
export function buildTodayHandoffPack(
  database: OrbitDatabase,
  options: { date?: string; generatedAt?: string } = {}
): HandoffPack;

export function buildProjectHandoffPack(
  database: OrbitDatabase,
  project: string,
  options: { generatedAt?: string } = {}
): HandoffPack;
```

Use `ActivityRepository`, `EventRepository`, `KnowledgeRepository`, `MemoryRepository`, `RecommendationRepository`, `SourceRepository`, and `AuditRepository`. Build `eventSafety` from stored Events plus SourceRecord permission scopes. For today, filter sessions by local date matching `startAt` or `endAt`; filter Knowledge by matching metadata time window or creation date; include confirmed active Memories; include active Recommendations with safe evidence. For project, filter by project fields and project-related evidence.

Write this audit log after successful generation:

```ts
audit.log("handoff.generate", "handoff_pack", pack.id, {
  kind: pack.kind,
  date: pack.date,
  project: pack.project,
  included: {
    activity: pack.recentActivity.length,
    knowledge: pack.confirmedKnowledge.length,
    memories: pack.activeMemories.length,
    recommendations: pack.recommendedNextActions.length
  },
  excluded: pack.excluded.length
});
```

- [ ] **Step 4: Run DB tests**

Run:

```bash
pnpm --filter @orbit/db test
pnpm typecheck
```

Expected: DB tests and typecheck pass.

## Task 3: CLI Handoff Commands

**Files:**

- Create `apps/cli/src/commands/handoff.ts`
- Modify `apps/cli/src/index.ts`
- Modify `apps/cli/src/cli.test.ts`

- [ ] **Step 1: Write failing CLI tests**

Add tests that use a temporary `ORBIT_HOME`, ingest fixtures, run the pipeline, and call helper functions:

```ts
it("generates today handoff JSON after fixture ingestion", async () => {
  await ingestFixtures();
  const artifacts = listKnowledgeArtifacts();
  runKnowledgeReviewAction(artifacts[0]!.id, "confirm");
  const pack = getTodayHandoff({ date: "2026-05-21", generatedAt: "2026-05-21T08:00:00.000Z" });

  expect(pack.kind).toBe("today");
  expect(pack.recentActivity.length).toBeGreaterThan(0);
  expect(pack.confirmedKnowledge.length).toBeGreaterThan(0);
  expect(pack.activeMemories.length).toBeGreaterThan(0);
  expect(JSON.stringify(pack)).not.toContain("content");
  expect(JSON.stringify(pack)).not.toContain("RAW_EVENT_TEXT");
});

it("formats today handoff as markdown", async () => {
  await ingestFixtures();
  const artifacts = listKnowledgeArtifacts();
  runKnowledgeReviewAction(artifacts[0]!.id, "confirm");
  const markdown = getTodayHandoffMarkdown({ date: "2026-05-21" });

  expect(markdown).toContain("# Orbit Handoff");
  expect(markdown).toContain("## Evidence Index");
});
```

Also assert `buildProgram().helpInformation()` contains `handoff`, `today`, and `project`.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm exec vitest run apps/cli/src/cli.test.ts
```

Expected: FAIL because handoff helpers and commands do not exist.

- [ ] **Step 3: Implement command helpers**

In `apps/cli/src/commands/handoff.ts`, implement:

```ts
export function getTodayHandoff(options: { date?: string; generatedAt?: string } = {}): HandoffPack;

export function getTodayHandoffMarkdown(options: { date?: string } = {}): string;

export function getProjectHandoff(project: string): HandoffPack;

export function getProjectHandoffMarkdown(project: string): string;
```

Each helper opens the database from `getCliConfig().orbitHome`, calls DB handoff assembly, formats when requested, and closes the database.

- [ ] **Step 4: Add Commander commands**

Add:

```bash
orbit handoff today --json
orbit handoff today --format markdown
orbit handoff today --date 2026-05-21
orbit handoff project <name> --json
orbit handoff project <name> --format markdown
```

Rules:

- `--json` outputs the structured pack.
- `--format markdown` outputs Markdown.
- default without either flag outputs Markdown.
- `--json` takes precedence over `--format markdown` when both are passed.

- [ ] **Step 5: Run CLI tests and manual commands**

Run:

```bash
pnpm --filter @orbit/cli test
pnpm --filter @orbit/cli orbit handoff today --json
pnpm --filter @orbit/cli orbit handoff today --format markdown
pnpm --filter @orbit/cli orbit handoff project orbit --json
```

Expected: commands succeed, output contains handoff sections, and output contains no raw private payload fields.

## Task 4: Codex And Local-Agent Source Hardening

**Files:**

- Modify `packages/adapters/src/codex/codexSessionReader.ts`
- Modify `packages/adapters/src/codex/codexAdapter.ts`
- Modify `packages/adapters/src/localAgent/localAgentAdapter.ts`
- Modify `packages/adapters/src/codexAdapter.test.ts`
- Modify `packages/adapters/src/localAgentAdapter.test.ts`
- Add `fixtures/realistic/codex/nested/orbit-child-session.json`
- Add `fixtures/realistic/local-agent/nested/agent-child-session.json`
- Add `fixtures/realistic/local-agent/malformed.jsonl`

- [ ] **Step 1: Add hardening tests**

Add adapter tests for:

- recursive nested directory traversal,
- deterministic sorted file order,
- invalid JSONL warnings that do not abort valid records,
- `.json` array record support,
- stable `codex://` and `local-agent://` source pointers based on relative paths,
- cursor idempotency where the second read from `nextCursor` returns zero Events,
- constructor requiring explicit `path` so no private default path scanning is introduced.

- [ ] **Step 2: Run adapter tests**

Run:

```bash
pnpm --filter @orbit/adapters test
```

Expected: tests either fail with the missing hardening behavior or pass and lock existing behavior. If they pass immediately, keep the new coverage and make no unnecessary adapter changes.

- [ ] **Step 3: Implement only missing hardening**

Allowed changes:

- improve warning messages,
- preserve stable source pointers,
- fix cursor boundaries,
- enforce deterministic file ordering,
- handle `.json` arrays consistently,
- reject unsupported file extensions through warnings rather than silent private scanning.

Forbidden changes:

- automatically reading `~/.codex`,
- reading private directories without explicit path,
- adding SeaTalk scraping,
- rewriting adapter architecture beyond the tested hardening.

- [ ] **Step 4: Run adapter and CLI ingestion checks**

Run:

```bash
pnpm --filter @orbit/adapters test
pnpm --filter @orbit/cli orbit ingest codex --path fixtures/codex-sessions --json
pnpm --filter @orbit/cli orbit ingest local-agent --path fixtures/realistic/local-agent --json
```

Expected: ingestion is explicit-path, idempotent on repeat, and warning-bearing invalid records do not abort the whole ingestion.

## Task 5: Desktop Handoff Review And Copy UX

**Files:**

- Modify `apps/desktop/electron/data.ts`
- Modify `apps/desktop/electron/main.ts`
- Modify `apps/desktop/electron/preload.ts`
- Modify `apps/desktop/electron/preload.test.ts`
- Modify `apps/desktop/src/orbitApi.ts`
- Modify `apps/desktop/src/App.tsx`
- Create `apps/desktop/src/routes/HandoffPage.tsx`
- Create `apps/desktop/src/routes/HandoffPage.test.ts`
- Modify `apps/desktop/src/i18n.tsx`

- [ ] **Step 1: Write failing preload/API exposure tests**

Extend `apps/desktop/electron/preload.test.ts` to assert the preload source exposes `generateHandoff`. Add `apps/desktop/src/routes/HandoffPage.test.ts` to statically assert the route contains i18n keys for generate, project input, preview, copy, safety boundaries, evidence count, and error states.

- [ ] **Step 2: Implement desktop action**

Expose this API in `apps/desktop/src/orbitApi.ts` and preload:

```ts
generateHandoff(
  input:
    | { kind: "today"; date?: string }
    | { kind: "project"; project: string }
): Promise<DesktopActionResult & { handoff: HandoffPack; markdown: string }>;
```

In Electron main/data, call DB handoff assembly and `formatHandoffMarkdown`. The action is local-only and side-effect-free except `handoff.generate` audit logging.

- [ ] **Step 3: Add Handoff route**

Create a top-level Handoff route with:

- generate today's handoff button,
- project input plus generate project handoff button,
- Markdown preview,
- copy Markdown button using `navigator.clipboard.writeText`,
- safety boundary list,
- evidence count,
- local error display that does not crash the app,
- no automatic send/share/export action.

- [ ] **Step 4: Add Chinese and English strings**

Add every visible label/message to `apps/desktop/src/i18n.tsx`. Required key concepts:

- Handoff navigation label,
- Generate Agent Handoff,
- Today Handoff,
- Project Handoff,
- Project name,
- Preview,
- Copy Markdown,
- Copied,
- Safety Boundaries,
- Evidence,
- No handoff generated yet,
- Handoff generation failed.

- [ ] **Step 5: Run desktop checks**

Run:

```bash
pnpm --filter @orbit/desktop test
pnpm --filter @orbit/desktop build
pnpm typecheck
```

Expected: tests, build, and typecheck pass.

## Task 6: Agent API Read-Only Descriptors

**Files:**

- Modify `packages/agent-api/src/index.ts`
- Create `packages/agent-api/src/index.test.ts`

- [ ] **Step 1: Write failing tests**

Tests must assert:

```ts
expect(agentApiStatus.ready).toBe(true);
expect(buildAgentHandoffResource("today")).toEqual({
  uri: "orbit://handoff/today",
  mimeType: "text/markdown",
  readOnly: true
});
expect(buildAgentHandoffResource({ kind: "project", project: "orbit" })).toEqual({
  uri: "orbit://handoff/project/orbit",
  mimeType: "text/markdown",
  readOnly: true
});
```

- [ ] **Step 2: Implement descriptor builders**

Implement resource descriptor builders only. Do not implement a running MCP server, local HTTP server, write API, or agent push/send flow in this goal.

- [ ] **Step 3: Run agent-api tests**

Run:

```bash
pnpm --filter @orbit/agent-api test
pnpm typecheck
```

Expected: tests and typecheck pass.

## Task 7: Screen/Audio Perception Research And Disabled Descriptors

**Files:**

- Create `docs/perception-research-spike.md`
- Create `packages/core/src/perception/perceptionCapabilities.ts`
- Create `packages/core/src/perception/perceptionCapabilities.test.ts`
- Modify `packages/core/src/types/common.ts`
- Modify `packages/core/src/index.ts`
- Modify `docs/product-principles.md`
- Modify `docs/architecture.md`
- Modify `docs/README.md`

- [ ] **Step 1: Write the research document**

Create `docs/perception-research-spike.md` with these sections:

- product position: perception is a future Source Adapter input, not the center of Orbit,
- macOS Accessibility API path for active app/window and accessible text,
- ScreenCaptureKit path for explicit screen/window capture,
- Apple Vision OCR path for fallback text extraction,
- audio capture/transcription options and why always-on microphone is not first implementation,
- permission prompts and visible running state,
- pause/stop behavior,
- app/window exclusion model,
- short TTL raw screenshot/audio/transcript policy,
- local-only processing default,
- storage and CPU risks,
- Event schema mapping to `screen_observation` and future audio event type,
- recommended first implementation: active app/window metadata plus Accessibility text,
- production-capture gate checklist.

- [ ] **Step 2: Add disabled perception descriptors**

Add code descriptors that make the future inputs visible without enabling capture:

```ts
export interface PerceptionCapabilityDescriptor {
  sourceKind: "screen" | "audio";
  displayName: string;
  status: "research_only";
  capturesRawMedia: false;
  enabledByDefault: false;
  requiresExplicitPermission: true;
  defaultAgentExport: false;
}
```

Export:

```ts
export const perceptionCapabilityDescriptors: readonly PerceptionCapabilityDescriptor[];
```

Tests must assert both descriptors exist, both are disabled by default, both require permission, both have `capturesRawMedia === false`, and both have `defaultAgentExport === false`.

- [ ] **Step 3: Add architecture docs**

Update docs to say screen/audio are first-class future Source Adapters and high-risk perception inputs, but Handoff Pack does not require them and default agent export remains blocked for raw perception data.

- [ ] **Step 4: Add production-capture gate checklist**

The research doc checklist must require confirmation of:

- permission copy,
- visible running state,
- pause/stop controls,
- retention defaults,
- exclusion UI,
- audit logging,
- local processing,
- redaction before persistence,
- agent export blocked by default,
- CPU/storage budget,
- explicit user approval before any raw media capture lands.

- [ ] **Step 5: Run core and doc formatting checks**

Run:

```bash
pnpm --filter @orbit/core test
pnpm typecheck
pnpm exec prettier --check docs/perception-research-spike.md docs/product-principles.md docs/architecture.md docs/README.md
```

Expected: core tests, typecheck, and formatting pass.

## Task 8: Documentation And Handoff Update

**Files:**

- Modify `docs/handoff-next-development.md`
- Modify `docs/milestone-plan.md`
- Modify `docs/handoff-pack.md`

- [ ] **Step 1: Update continuation docs**

After implementation, update `docs/handoff-next-development.md` with:

- branch name,
- commit hash after checkpoint,
- implemented handoff CLI commands,
- desktop handoff route summary,
- Codex/local-agent hardening summary,
- perception research document link,
- exact acceptance commands run,
- remaining watchouts.

- [ ] **Step 2: Align milestone docs**

Update `docs/milestone-plan.md` so Handoff Pack and agent continuity are clearly the next shipped product capability before broader MCP and before perception capture.

- [ ] **Step 3: Reconcile Handoff Pack spec**

Update `docs/handoff-pack.md` only for details that changed during implementation, such as exact CLI flags, default exclusions, or Desktop behavior. Do not dilute the privacy-safe default rules.

- [ ] **Step 4: Run formatting**

Run:

```bash
pnpm exec prettier --check docs/handoff-next-development.md docs/milestone-plan.md docs/handoff-pack.md
```

Expected: formatting passes.

## Task 9: Final Verification And Checkpoint

**Files:**

- All modified Goal 7 files.

- [ ] **Step 1: Run all required acceptance commands**

Run every command listed in **Required Acceptance Commands**. Keep `ORBIT_HOME="$PWD/.tmp/goal-7-acceptance"` for CLI acceptance commands. Run Desktop E2E and package commands sequentially.

- [ ] **Step 2: Inspect git status**

Run:

```bash
git status --short
```

Expected: only Goal 7 files are modified.

- [ ] **Step 3: Commit and push**

If all verification passes and no unrelated changes are present:

```bash
git add <goal-7-files>
git commit -m "feat: add agent handoff continuity goal"
git push
```

If verification fails, do not force a checkpoint. Report the exact failing command and the smallest next action.

## Self-Review Notes

- Spec coverage: Handoff Pack, explicit-path source hardening, Desktop review/copy, read-only agent descriptors, and screen/audio research are all covered in one Goal 7 plan.
- Placeholder scan: the plan has fixed file paths, fixed commands, fixed default exclusions, and no open implementation placeholders.
- Type consistency: the plan uses existing `ReviewStatus`, `Sensitivity`, `SourceKind`, `PermissionScope.canExportToAgent`, and Recommendation statuses. It intentionally adds `SourceKind` `"audio"` only for disabled future capability descriptors.
- Scope boundary: screen/audio production capture remains out of scope. The accepted artifact is research plus disabled descriptors.
- Product boundary: Handoff Pack remains the shipped surface; MCP, HTTP, Skill wrappers, and perception capture remain later work.
