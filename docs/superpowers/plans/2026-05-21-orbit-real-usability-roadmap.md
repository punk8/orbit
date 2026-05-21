# Orbit Real Usability Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Orbit from the current fixture-backed Alpha skeleton to a genuinely usable local-first work context product.

**Architecture:** Keep the stable product spine unchanged: `Source Adapter -> Event -> Activity Session -> Knowledge Artifact -> Memory -> Recommendation -> Handoff`. The plan closes the gaps around real source setup, background observation, live perception, review governance, semantic quality, reliability, and macOS distribution without relaxing Orbit's privacy model.

**Tech Stack:** TypeScript, pnpm, Vitest, Commander CLI, Electron + React + Vite, SQLite via `better-sqlite3`, Kysely, macOS Swift/native helper, ScreenCaptureKit, Apple Vision OCR, AVFoundation or documented local audio capture path, existing `@orbit/*` packages.

---

## Current Baseline

Validated on `main` at `a9a15bd docs: record goal 9d live perception blocker` on 2026-05-21:

- `pnpm test`: passed after rebuilding `better-sqlite3` for the active Node ABI; 39 files / 127 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm --filter @orbit/desktop build`: passed.
- `pnpm --filter @orbit/desktop test:e2e`: passed.
- `pnpm --filter @orbit/desktop package:dir`: passed and generated `apps/desktop/release/mac-arm64/Orbit.app`; it also warned that package metadata is incomplete, the default Electron icon is used, and code signing is skipped.
- Clean fixture flow passed: `orbit ingest fixtures`, `orbit pipeline run`, `orbit context today`, `orbit handoff today`, `orbit perception release-gate`.
- Realistic sanitized Codex and generic local-agent fixtures ingest with malformed-record warnings and no crashes.

Known blockers:

- Native dependency ABI is fragile today. Electron packaging/e2e rebuilds `better-sqlite3` for Electron (`NODE_MODULE_VERSION 130`), which breaks concurrently running Node CLI/test commands expecting Node ABI 127 until `pnpm rebuild better-sqlite3` runs again. `package:dir` repairs this at the end, but concurrent or interrupted workflows can leave the repository unusable for CLI/tests.
- `docs/goal-9d-live-perception-runtime-blocker.md` explicitly blocks live screen/OCR/audio perception.
- `apps/desktop/native/macos-observer` is Tier 1 only: app/window metadata, no screen, OCR, audio, clipboard, Accessibility traversal, or keystrokes.
- `apps/desktop/electron/observation/observationService.ts` only runs `Tier1MacObserver` and has no live screen/OCR/audio session manager.
- The app is unsigned, not notarized, and uses the default Electron icon.
- Running several CLI commands concurrently against a freshly initialized `ORBIT_HOME` can hit `SQLITE_BUSY`; sequential usage works. This still needs a deterministic concurrency regression test.
- `packages/agent-api` is descriptor-only; there is no running MCP server, local HTTP API, or packaged Skill wrapper.
- Full-product gate commands such as `orbit automation ...` and `orbit debug-bundle ...` are planned but not implemented.
- SeaTalk remains approved-import-only.

## Usability Gates

This plan defines three release gates. Do not call Orbit "truly usable" until Gate 2 passes.

### Gate 1: Developer Dogfood Usable

A developer can run Orbit locally, explicitly add safe local sources, ingest real local agent/Codex data, review generated Knowledge/Memory/Recommendations, and generate a safe Handoff without using fixture-only flows.

Gate 1 also requires the killer loop to work end to end: confirmed Knowledge can produce a reviewed
Memory, confirmed Memory appears in Handoff, and a local read-only Agent interface can retrieve the
same safe Handoff. Gate 1 excludes live screen/OCR/audio capture and external distribution.

### Gate 2: Daily Alpha Usable

A trusted internal user can leave Orbit running, see visible collection state, intentionally enable bounded live sources, pause/stop/delete them, and get useful Today, Activity, Knowledge, Memory candidates, Recommendations, and Handoff output from real work context.

Gate 2 requires resolving Goal 9D.

### Gate 3: External Beta Usable

A user outside the development team can install a signed/notarized macOS build, understand privacy boundaries, configure sources without developer tools, export/debug local state, and recover from failures without data loss.

Gate 3 requires packaging, signing, notarization, support bundle, migration policy, and clean-machine smoke.

## Stop Lines

- Do not implement Goal 9E or 9F behavior before Goal 9D live perception acceptance passes.
- Do not ship raw screen/audio capture until the production-capture gate in `docs/perception-research-spike.md` is satisfied.
- Do not add side-effect automation. Recommendations remain read-only or Orbit-local intent records.
- Do not add silent private-path scans. Every production source must have explicit setup and visible permission scope.
- Do not upload raw screenshots, audio, transcripts, private chat, or code content by default.

## Execution Strategy

Use one branch per goal and commit only after the goal acceptance commands pass. Push each checkpoint before starting the next goal.

Recommended branch names:

- `codex/usable-0-baseline-hardening`
- `codex/usable-1-source-setup`
- `codex/usable-2-review-governance`
- `codex/usable-2a-agent-interface`
- `codex/usable-3-tier1-runtime`
- `codex/usable-4-live-perception`
- `codex/usable-5-daily-context`
- `codex/usable-6-semantic-quality`
- `codex/usable-7-release-readiness`

---

## Execution Detail Rules

This roadmap is intentionally broader than a single coding plan. To keep implementation from
turning into one giant branch, every goal below must produce a working, reviewable checkpoint.

For each goal:

- Start from a clean branch named in the list above.
- Keep the write set limited to the files listed for that goal unless a test exposes a required
  adjacent change.
- Write or update focused tests before the implementation when the change has observable behavior.
- Run the goal acceptance commands in a fresh `ORBIT_HOME`.
- Install `jq` or replace the few `jq`-based shell snippets with an equivalent Node one-liner when
  running acceptance on a clean machine.
- Launch the desktop app at least once with a clean `ORBIT_HOME` when the goal changes user-facing
  behavior.
- Record manual smoke findings in the goal doc or release checklist.
- Commit only after `git status` shows no unrelated user changes are included.
- Push the checkpoint branch before starting the next goal.

### Immediate Killer Loop

The first implementation wave should prioritize the loop that makes Orbit feel necessary:

```text
Explicit local source setup
  -> ingest real work context
  -> Activity evidence
  -> Knowledge review
  -> Memory candidate review
  -> confirmed Memory
  -> Handoff pack
  -> read-only Agent interface
```

This loop is the minimum product shape for Orbit's "agent continuity" promise. Live screen, OCR,
and audio remain important inputs, but they should not delay the read-only Handoff/Memory loop for
Codex and local-agent sources.

### Immediate Execution Slices

Use these slices as the more detailed execution layer for Goals 0, 1, 2, and 2A. They are ordered
so each slice creates a product improvement that can be tried without waiting for live perception.

#### Slice A: Install And Window-Control Baseline

**Maps to:** Goal 0.

**User-visible outcome:** A developer can package Orbit, launch exactly the intended build, verify
which database it is using, and inspect the main window through a deterministic smoke path.

**Implementation details:**

- Give development, local packaged, and future signed builds distinct enough metadata to prevent
  macOS from activating an older Orbit build with the same bundle ID during smoke tests.
- Add a packaged-app launch smoke that starts `apps/desktop/release/mac-arm64/Orbit.app` directly,
  passes a clean `ORBIT_HOME`, waits for the renderer, and verifies:
  - `window.orbit` exists,
  - the visible Settings runtime panel reports the same `ORBIT_HOME`,
  - the main window can be detected through a deterministic automation path,
  - no default private source path is read on first launch.
- Keep the existing unsigned `package:dir` flow for local development, but make its recovery path
  explicit when interrupted.
- Record the known limitation if Computer Use still cannot attach to Electron windows after the
  deterministic smoke passes.

**Acceptance add-ons:**

```bash
rm -rf .tmp/usable-0-packaged
export ORBIT_HOME="$PWD/.tmp/usable-0-packaged"
pnpm --filter @orbit/desktop package:dir
pnpm --filter @orbit/desktop package:smoke -- --app apps/desktop/release/mac-arm64/Orbit.app --orbit-home "$ORBIT_HOME"
pnpm --filter @orbit/cli orbit status --json
```

Expected:

- The packaged smoke proves the app reads the requested `ORBIT_HOME`.
- The app opens the main window for the intended build, not a stale worktree build.
- CLI still works after the packaged smoke because Node ABI has been restored.

#### Slice B: Explicit Real Source Dogfood

**Maps to:** Goal 1.

**User-visible outcome:** A developer can open Sources, add a Codex or local-agent directory, run
ingestion, see health/warnings, and rerun ingestion without duplicate Events.

**Implementation details:**

- The first-run Sources page must show "no production sources configured" instead of implying that
  fixtures are production data.
- Adding a source must show a pre-save disclosure with:
  - absolute path,
  - adapter kind,
  - readable fields,
  - sensitivity default,
  - raw storage default,
  - AI eligibility,
  - agent export eligibility,
  - retention policy,
  - cursor semantics.
- Background ingestion must use the persisted adapter config. A source that lacks a path must show
  a repair action and must not keep the whole runtime in a vague error state.
- "Run now" must update last sync, last event, inserted/skipped counts, warnings, and cursor state.
- Fixture sources should remain available for demos/tests, but must be visually labeled as fixture
  sources.

**Acceptance add-ons:**

```bash
rm -rf .tmp/usable-1-real-source
export ORBIT_HOME="$PWD/.tmp/usable-1-real-source"
pnpm --filter @orbit/cli orbit source add codex --path fixtures/codex-sessions --label "Codex fixture dogfood" --json
pnpm --filter @orbit/cli orbit source run codex_local --json
pnpm --filter @orbit/cli orbit source run codex_local --json
pnpm --filter @orbit/cli orbit status --json
pnpm --filter @orbit/cli orbit activity list --json
```

Expected:

- The second source run inserts zero duplicate Events.
- The source has a persisted adapter path and no "missing adapter path" runtime error.
- Desktop Sources can perform the same setup and run-now flow without direct DB edits.

#### Slice C: Memory Closure Before More Inputs

**Maps to:** Goal 2.

**User-visible outcome:** The user can confirm a Knowledge draft, generate Memory candidates from it,
confirm one Memory, and see that confirmed Memory appear in Handoff while drafts remain excluded.

**Implementation details:**

- Knowledge review actions must preserve evidence links and audit entries.
- Memory candidate generation must only accept confirmed Knowledge IDs.
- Memory candidates must start as `needs_review` and must include:
  - concise body,
  - source Knowledge ID,
  - source Activity IDs,
  - category,
  - scope,
  - tags,
  - confidence,
  - evidence IDs,
  - created-from metadata.
- Confirmed Memory must appear in Memory search and default Handoff.
- Rejected or archived Memory must not appear in default context or Handoff.
- Re-running the pipeline must not duplicate candidates for the same confirmed Knowledge.

**Acceptance add-ons:**

```bash
rm -rf .tmp/usable-2-memory-loop
export ORBIT_HOME="$PWD/.tmp/usable-2-memory-loop"
pnpm --filter @orbit/cli orbit ingest fixtures --json
pnpm --filter @orbit/cli orbit pipeline run --json
knowledge_id="$(pnpm --filter @orbit/cli orbit knowledge list --json | jq -r '.knowledgeArtifacts[0].id')"
pnpm --filter @orbit/cli orbit knowledge review "$knowledge_id" --action confirm --json
memory_id="$(pnpm --filter @orbit/cli orbit memory generate --from-knowledge "$knowledge_id" --json | jq -r '.memories[0].id')"
pnpm --filter @orbit/cli orbit memory review "$memory_id" --action confirm --json
pnpm --filter @orbit/cli orbit handoff today --json
```

Expected:

- Before Memory confirmation, Handoff contains zero active Memories.
- After confirmation, Handoff includes the confirmed Memory and evidence pointers.
- Draft Knowledge and unconfirmed Memory remain excluded with reasons.

#### Slice D: Read-Only Agent Continuity Interface

**Maps to:** Goal 2A.

**User-visible outcome:** Codex, Claude Code, or another local agent can read a bounded Handoff pack
without scraping the UI or touching private raw data.

**Implementation details:**

- Keep the interface read-only by default.
- Expose the same underlying Handoff object through:
  - CLI,
  - local HTTP loopback API,
  - MCP resource descriptors or a minimal MCP server,
  - a documented Skill wrapper shape.
- Include schema version, generated-at timestamp, source exclusion reasons, and evidence IDs in all
  response forms.
- Require explicit user action or local configuration before starting any long-running server.
- Never expose raw screenshots, audio, transcripts, private message bodies, full command output, or
  unreviewed Memory by default.

**Acceptance add-ons:**

```bash
rm -rf .tmp/usable-2a-agent
export ORBIT_HOME="$PWD/.tmp/usable-2a-agent"
pnpm --filter @orbit/cli orbit ingest fixtures --json
pnpm --filter @orbit/cli orbit pipeline run --json
pnpm --filter @orbit/cli orbit handoff today --json
pnpm --filter @orbit/cli orbit agent resources --json
pnpm --filter @orbit/cli orbit agent serve --once --port 0 --json
```

Expected:

- CLI, local API, and MCP descriptors return the same Handoff schema version.
- All raw payload classes are excluded by default.
- Starting the local agent surface is visible, auditable, and stoppable.

#### Slice E: Product Scenario Dogfood Log

**Maps to:** Gate 1 completion.

**User-visible outcome:** The team can decide whether Orbit is genuinely useful for a real workday,
not just whether commands pass.

**Dogfood script:**

1. Create a clean `ORBIT_HOME`.
2. Add one explicit Codex or local-agent source.
3. Run ingestion from Desktop and CLI.
4. Open Today and verify it explains the day in under 30 seconds.
5. Open Activity detail and verify evidence pointers.
6. Confirm one Knowledge draft.
7. Generate and confirm one Memory.
8. Accept or dismiss one Recommendation.
9. Generate Today Handoff and Project Handoff.
10. Read the Handoff through the read-only Agent interface.
11. Export a debug bundle and verify it excludes raw payloads.
12. Clear local data only after a confirmation boundary.

Done when the dogfood log answers:

- What did Orbit read?
- What did Orbit save?
- What did Orbit derive?
- What did the user review?
- What entered Memory?
- What entered Handoff?
- What was excluded and why?

---

## Goal 0: Baseline Hardening Before Product Work

**Outcome:** The current CLI/Desktop baseline is stable enough for repeated local dogfood and does not fail under common local concurrency or packaging workflows.

**Why first:** The product cannot be trusted if a background Electron process and CLI commands can collide on SQLite initialization or if package/e2e runs can leave the repo in an ABI-confused state. The current scripts repair Node ABI after successful packaging, but a concurrent CLI command or interrupted package run can still fail with `ERR_DLOPEN_FAILED`.

**Files:**

- Modify `packages/db/src/connection.ts`
- Modify `packages/db/src/migrate.ts`
- Modify or create `packages/db/src/connectionConcurrency.test.ts`
- Modify `apps/cli/src/cli.test.ts`
- Modify `apps/desktop/package.json`
- Modify `apps/desktop/electron-builder.yml`
- Create `apps/desktop/scripts/rebuild-native.mjs`
- Modify `apps/desktop/scripts/e2e-smoke.mjs`
- Modify `docs/alpha-release-checklist.md`
- Modify `docs/handoff-next-development.md`

### Tasks

- [ ] Add a database open policy that sets a busy timeout before write-heavy pragmas and migrations.
- [ ] Add a process-local migration/open guard so parallel opens in the same Node process do not run migrations concurrently.
- [ ] Add a regression test that starts several parallel `openOrbitDatabase({ orbitHome })` calls against a fresh temp directory and expects all calls to complete.
- [ ] Add a CLI smoke test that runs `status`, `ai status`, and `perception status` sequentially after `package:dir` rebuilds native modules.
- [ ] Replace inline native rebuild scripts with a single rebuild wrapper that serializes `better-sqlite3` ABI rebuilds through a lock file.
- [ ] Make `package:dir`, `package:dmg`, and `test:e2e` always restore Node ABI in `finally` even if Electron packaging fails or is interrupted by a normal failure path.
- [ ] Add an explicit `pnpm --filter @orbit/desktop native:node` command and document it as the recovery command after a killed package/e2e process.
- [ ] Add package metadata required for a real app identity: description, author, product name, app ID, version source, and a simple generated development icon asset.
- [ ] Document the exact post-package ABI recovery behavior; keep `package:dir` restoring Node ABI as it does now.
- [ ] Commit with `fix: harden local runtime baseline`.

### Acceptance Commands

```bash
rm -rf .tmp/usable-0
export ORBIT_HOME="$PWD/.tmp/usable-0"
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
pnpm --filter @orbit/desktop package:dir
pnpm --filter @orbit/cli orbit status --json
pnpm --filter @orbit/cli orbit ai status --json
pnpm --filter @orbit/cli orbit perception status --json
pnpm --filter @orbit/desktop native:electron
pnpm --filter @orbit/desktop native:node
pnpm --filter @orbit/cli orbit status --json
```

Expected:

- No `SQLITE_BUSY` from normal parallel open tests.
- Node CLI still works after `package:dir`, `test:e2e`, and explicit Electron-to-Node native rebuild recovery.
- Native rebuilds cannot overlap and leave `better-sqlite3` in the wrong ABI for the next command.
- Packaged app directory exists under `apps/desktop/release/mac-arm64/Orbit.app`.

---

## Goal 1: Real Source Setup And Dogfood Ingestion

**Outcome:** A developer can configure explicit local sources from Desktop or CLI, ingest real Codex/local-agent exports, see source health, and rerun ingestion without duplicate Events.

**Files:**

- Modify `apps/desktop/src/routes/SourcesPage.tsx`
- Modify `apps/desktop/src/routes/SourcesPage.test.ts`
- Modify `apps/desktop/electron/data.ts`
- Modify `apps/desktop/electron/main.ts`
- Modify `apps/desktop/electron/preload.ts`
- Modify `apps/desktop/src/orbitApi.ts`
- Modify `apps/cli/src/commands/ingestCodex.ts`
- Modify `apps/cli/src/commands/ingestLocalAgent.ts`
- Modify `packages/db/src/repositories/sourceRepository.ts`
- Modify `packages/adapters/src/codex/*`
- Modify `packages/adapters/src/localAgent/*`
- Add sanitized dogfood fixtures under `fixtures/realistic/`
- Modify `docs/sanitized-real-fixtures-guide.md`
- Modify `docs/source-adapter-complete-contract.md`

### Tasks

- [ ] Add Desktop source setup actions for explicit-path Codex and generic local-agent directories.
- [ ] Before saving a source, show path, adapter type, readable fields, raw storage policy, AI policy, and agent export policy.
- [ ] Persist source adapter config with versioned shape, absolute path, display label, enabled state, and permission scope.
- [ ] Add "run ingestion now" from the Sources UI for configured Codex/local-agent sources.
- [ ] Add source-level warning/error display for malformed files, unsupported records, and cursor fallback.
- [ ] Add path reconfiguration and cursor reset smoke coverage for explicit sources.
- [ ] Add a sanitized dogfood fixture generator guide that explains how to strip private content while preserving source pointer shapes.
- [ ] Commit with `feat: add explicit local source setup`.

### Acceptance Commands

```bash
rm -rf .tmp/usable-1
export ORBIT_HOME="$PWD/.tmp/usable-1"
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/cli orbit ingest codex --path fixtures/codex-sessions --json
pnpm --filter @orbit/cli orbit ingest local-agent --path fixtures/realistic/local-agent --json
pnpm --filter @orbit/cli orbit pipeline run --json
pnpm --filter @orbit/cli orbit activity list --json
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
```

Expected:

- Re-running both ingestion commands inserts zero duplicate Events.
- Sources UI can configure and run at least one explicit local source without developer-only DB edits.
- No production source reads default private paths automatically.

---

## Goal 2: Review Governance That Users Can Actually Operate

**Outcome:** Knowledge, Memory, and Recommendations are reviewable from the desktop app, not only present in storage or CLI.

**Files:**

- Modify `apps/desktop/src/routes/ReviewQueuePage.tsx`
- Modify `apps/desktop/src/routes/KnowledgePage.tsx`
- Modify `apps/desktop/src/routes/MemoryPage.tsx`
- Modify `apps/desktop/src/routes/RecommendationsPage.tsx`
- Modify `apps/desktop/src/routes/TodayPage.tsx`
- Modify `apps/desktop/electron/data.ts`
- Modify `apps/desktop/electron/preload.ts`
- Modify `apps/desktop/src/orbitApi.ts`
- Modify `packages/db/src/governance.ts`
- Modify `packages/db/src/repositories/auditRepository.ts`
- Modify `apps/cli/src/commands/governanceActions.ts`
- Modify `apps/desktop/src/i18n.tsx`

### Tasks

- [ ] Build a real Review Queue that groups draft Knowledge, Memory candidates, and new Recommendations.
- [ ] Add edit, confirm, reject, and archive actions for Knowledge in Desktop with audit logs.
- [ ] Add generate-from-confirmed-Knowledge, edit, confirm, reject, and archive actions for Memory candidates in Desktop.
- [ ] Add accept, dismiss, snooze, and resolve actions for Recommendations in Desktop; accepting records intent only.
- [ ] Preserve review state across `pipeline run` and activity rebuilds.
- [ ] Add evidence expansion on every review item.
- [ ] Add Chinese and English UI strings for every review action and confirmation state.
- [ ] Commit with `feat: complete review governance loops`.

### Acceptance Commands

```bash
rm -rf .tmp/usable-2
export ORBIT_HOME="$PWD/.tmp/usable-2"
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/cli orbit ingest fixtures --json
pnpm --filter @orbit/cli orbit pipeline run --json
pnpm --filter @orbit/cli orbit knowledge list --json
pnpm --filter @orbit/cli orbit memory list --json
pnpm --filter @orbit/cli orbit recommendation list --json
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
```

Expected:

- No Memory appears in default context until confirmed.
- Rejected Knowledge never generates Memory candidates.
- Dismissed/resolved Recommendations do not reappear after re-index without new evidence.

---

## Goal 2A: Read-Only Agent Continuity Interface

**Outcome:** Handoff becomes a real product interface for external agents. A local agent can ask
Orbit for today's or a project's bounded context through CLI, local loopback API, and MCP-compatible
resource shapes without scraping the desktop UI or receiving raw private payloads.

**Why here:** Agent continuity is Orbit's most urgent "must-have" product loop. Waiting until after
live perception would make the product better at collecting inputs before it is good at delivering
the continuity value.

**Files:**

- Modify `packages/agent-api/src/index.ts`
- Create `packages/agent-api/src/resourceServer.ts`
- Create `packages/agent-api/src/resourceServer.test.ts`
- Create `packages/agent-api/src/httpServer.ts`
- Create `packages/agent-api/src/httpServer.test.ts`
- Modify `packages/core/src/handoff/*`
- Modify `packages/db/src/handoffAssembly.ts`
- Modify `apps/cli/src/index.ts`
- Create `apps/cli/src/commands/agent.ts`
- Modify `apps/desktop/electron/main.ts`
- Modify `apps/desktop/electron/preload.ts`
- Modify `apps/desktop/src/orbitApi.ts`
- Modify `apps/desktop/src/routes/SettingsPage.tsx`
- Modify `apps/desktop/src/i18n.tsx`
- Create `docs/agent-interface.md`
- Create `docs/orbit-skill-wrapper.md`

### Tasks

- [ ] Define a versioned `AgentResourceDescriptor` that includes resource URI, title, MIME type,
  schema version, privacy boundary, and supported query parameters.
- [ ] Add descriptors for `orbit://handoff/today`, `orbit://handoff/project/{projectName}`,
  `orbit://context/today`, `orbit://context/project/{projectName}`, and `orbit://status`.
- [ ] Add a shared assembler so CLI, HTTP, and MCP descriptors all return the same Handoff/context
  object shape.
- [ ] Add `orbit agent resources --json` to list available read-only resources.
- [ ] Add `orbit agent read orbit://handoff/today --json` and
  `orbit agent read orbit://handoff/project/orbit --json`; document project-name URL encoding.
- [ ] Add `orbit agent serve --port 0 --json` for a loopback-only HTTP server with automatic free-port selection.
- [ ] Bind the HTTP server to `127.0.0.1` only and reject non-loopback hosts.
- [ ] Add a Desktop Settings control to enable/disable the local agent interface and show bound port,
  status, last access time, and audit summary.
- [ ] Add audit logs for resource listing, resource reads, server start, server stop, and rejected
  access.
- [ ] Add privacy tests proving raw Event text, screenshots, OCR text, audio, transcripts, API keys,
  and non-exportable sources are excluded by default.
- [ ] Add a documented Skill wrapper contract that tells Codex/Claude Code how to request a Handoff
  and how to cite exclusion reasons.
- [ ] Commit with `feat: expose read-only agent handoff interface`.

### Acceptance Commands

```bash
rm -rf .tmp/usable-2a
export ORBIT_HOME="$PWD/.tmp/usable-2a"
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/cli orbit ingest fixtures --json
pnpm --filter @orbit/cli orbit pipeline run --json
pnpm --filter @orbit/cli orbit handoff today --json
pnpm --filter @orbit/cli orbit agent resources --json
pnpm --filter @orbit/cli orbit agent read orbit://handoff/today --json
pnpm --filter @orbit/cli orbit agent read orbit://context/today --json
pnpm --filter @orbit/cli orbit agent serve --once --port 0 --json
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
```

Expected:

- CLI resource reads and local HTTP reads return the same schema version and privacy exclusions as
  `orbit handoff today --json`.
- Every returned object includes evidence pointers and exclusion reasons when objects are omitted.
- No raw private payload classes are present in agent-facing output.
- The local server is disabled by default and can be stopped without leaving a background process.

Gate 1 should not be considered product-useful until Goal 2A passes with one confirmed Memory in a
Handoff pack.

---

## Goal 3: Tier 1 Background Runtime Dogfood

**Outcome:** Users can leave Orbit running for low-risk app/window observation, pause/resume/stop it visibly, and see resulting Activity without screen or audio capture.

**Files:**

- Modify `apps/desktop/electron/observation/tier1MacObserver.ts`
- Modify `apps/desktop/electron/observation/observationService.ts`
- Modify `apps/desktop/native/macos-observer/README.md`
- Modify `apps/desktop/native/macos-observer/Sources/main.swift`
- Modify `apps/desktop/electron/main.ts`
- Modify `apps/desktop/src/routes/SourcesPage.tsx`
- Modify `apps/desktop/src/routes/SettingsPage.tsx`
- Modify `apps/desktop/src/routes/TodayPage.tsx`
- Modify `packages/adapters/src/desktop/*`
- Modify `packages/core/src/observation/*`
- Add manual smoke doc `docs/tier1-background-runtime-smoke.md`

### Tasks

- [ ] Make Tier 1 observer startup failure visible in runtime status and Sources UI.
- [ ] Add menu bar/tray state for collecting, paused, warning, error, and disabled.
- [ ] Package or explicitly launch the Tier 1 helper in a documented development mode; do not silently trust an unsigned helper for Beta.
- [ ] Add "ignore current app/window" and protected-app status display for Tier 1 metadata.
- [ ] Ensure low-signal app-focus-only sessions do not flood Knowledge drafts.
- [ ] Add a manual macOS smoke that starts, pauses, resumes, stops, restarts, and verifies Activity creation.
- [ ] Commit with `feat: make tier1 background observation dogfoodable`.

### Acceptance Commands

```bash
rm -rf .tmp/usable-3
export ORBIT_HOME="$PWD/.tmp/usable-3"
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
pnpm --filter @orbit/cli orbit observe status --json
pnpm --filter @orbit/cli orbit observe permissions --json
pnpm --filter @orbit/cli orbit observe ingest-mock --json
pnpm --filter @orbit/cli orbit activity list --json
```

Expected:

- Orbit can be left running with Tier 1 only.
- Pause stops new observation immediately.
- Stop disables collection and clears queued observations.
- No screen, OCR, audio, clipboard, Accessibility traversal, or keystrokes are captured.

Gate 1 is complete after Goals 0, 1, 2, 2A, and 3 pass and one full dogfood day with explicit Codex/local-agent source ingestion produces useful Handoff output with at least one confirmed Memory.

---

## Goal 4: Resolve Goal 9D With Production Live Perception Runtime

**Outcome:** Goal 9D is unblocked. Orbit can run opt-in screen/OCR and explicit audio sessions locally with visible state, protected-app suppression, bounded queues, local OCR/transcription path, and no writes after stop/delete.

**Files:**

- Create `apps/desktop/native/perception-helper/`
- Create `apps/desktop/native/perception-helper/Sources/*`
- Modify `apps/desktop/electron/observation/observationService.ts`
- Create `apps/desktop/electron/observation/perceptionSessionManager.ts`
- Create `apps/desktop/electron/observation/perceptionProtocol.ts`
- Create `apps/desktop/electron/observation/perceptionQueue.ts`
- Modify `packages/adapters/src/screen/*`
- Modify `packages/adapters/src/ocr/*`
- Modify `packages/adapters/src/audio/*`
- Modify `packages/adapters/src/transcript/*`
- Modify `packages/privacy/src/index.ts`
- Modify `packages/db/src/perceptionSettings.ts`
- Modify `packages/db/src/perceptionCleanup.ts`
- Modify `apps/desktop/src/routes/SourcesPage.tsx`
- Modify `apps/desktop/src/routes/SettingsPage.tsx`
- Modify `apps/cli/src/commands/perception.ts`
- Replace `docs/goal-9d-live-perception-runtime-blocker.md` with a completion note after acceptance passes.

### Tasks

- [ ] Define a local JSON-lines IPC protocol for helper session lifecycle: `start`, `pause`, `resume`, `stop`, `delete`, `state`, `frame`, `ocr_result`, `audio_chunk`, `transcript_result`, `warning`, `error`.
- [ ] Add a Swift helper target with no network access and explicit session state reporting.
- [ ] Implement ScreenCaptureKit display/app/window/region scope selection with Screen Recording permission checks.
- [ ] Enforce protected apps and excluded windows before frame capture.
- [ ] Add sparse frame capture with hashing, size bounds, queue limits, and no raw frame retention by default.
- [ ] Add Apple Vision OCR for bounded captured frames with Chinese and English recognition.
- [ ] Redact OCR text before Event persistence; failed redaction drops text and blocks AI/export.
- [ ] Add explicit microphone or meeting/session audio capture with AVFoundation/AVAudioEngine or a documented macOS-supported equivalent.
- [ ] Add bounded audio chunking, no ambient always-on mode, and no raw audio retention by default.
- [ ] Connect audio chunks to transcription provider routes only when policy allows.
- [ ] Add stop/delete cancellation tokens so delayed OCR/transcription/model jobs cannot persist after stop/delete.
- [ ] Show selected scope, status, queue depth, last processed time, provider state, pause/resume, stop, and delete controls in Desktop.
- [ ] Add CLI smoke commands for live helper status and mock/live mode distinction.
- [ ] Commit with `feat: add live opt-in perception runtime`.

### Acceptance Commands

```bash
rm -rf .tmp/usable-4
export ORBIT_HOME="$PWD/.tmp/usable-4"
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/adapters test
pnpm --filter @orbit/desktop test
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
pnpm --filter @orbit/cli orbit observe status --json
pnpm --filter @orbit/cli orbit perception status --json
pnpm --filter @orbit/cli orbit perception screen-ocr-smoke --json
pnpm --filter @orbit/cli orbit perception transcribe-fixture --json
pnpm --filter @orbit/cli orbit activity list --json
pnpm --filter @orbit/cli orbit context today --json
```

Manual macOS smoke:

- Start screen/OCR session for a selected window.
- Verify visible running state.
- Pause and confirm no new frames are persisted.
- Resume and confirm bounded Events are created.
- Open a protected app and confirm capture is suppressed before persistence.
- Stop and confirm streams are torn down.
- Delete and confirm delayed jobs do not write new content.
- Start explicit audio session, stop it, and confirm transcript policy and cleanup behavior.

Expected:

- Goal 9D blocker can be closed.
- Live opt-in perception Events feed Activity and Today.
- No raw media is stored by default.

---

## Goal 5: Daily Context Automation Loop

**Outcome:** With configured sources, Orbit automatically drains observations, runs semantic processing, refreshes Today/Handoff, and exposes skipped/blocked/error states without hiding policy decisions.

**Files:**

- Create `packages/db/src/backgroundProcessor.ts`
- Create `packages/db/src/backgroundProcessor.test.ts`
- Modify `packages/db/src/semanticPipeline.ts`
- Modify `apps/desktop/electron/main.ts`
- Modify `apps/desktop/electron/data.ts`
- Modify `apps/desktop/src/routes/TodayPage.tsx`
- Modify `apps/desktop/src/routes/SourcesPage.tsx`
- Modify `apps/desktop/src/routes/SettingsPage.tsx`
- Create `apps/cli/src/commands/automation.ts`
- Modify `apps/cli/src/index.ts`
- Modify `docs/release-readiness-spec.md`

### Tasks

- [ ] Add a background processor with explicit stages: source ingestion, observation drain, perception processing, semantic pipeline, Memory candidate scheduling, Recommendation refresh, Today refresh, Handoff refresh.
- [ ] Add manual run, scheduled run, pause, resume, stop, status, and queue controls.
- [ ] Make each stage report `ready`, `running`, `skipped_by_policy`, `provider_disabled`, `redaction_failed`, `protected_app_blocked`, `budget_exhausted`, `warning`, or `error`.
- [ ] Keep deterministic fallback when providers are disabled.
- [ ] Ensure a failing source or model job does not stop the full daily loop.
- [ ] Add audit logs for every automation stage and skipped-by-policy decision.
- [ ] Commit with `feat: add visible daily automation loop`.

### Acceptance Commands

```bash
rm -rf .tmp/usable-5
export ORBIT_HOME="$PWD/.tmp/usable-5"
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/cli orbit ingest fixtures --json
pnpm --filter @orbit/cli orbit ingest perception-fixtures --vision --audio --json
pnpm --filter @orbit/cli orbit automation run-once --json
pnpm --filter @orbit/cli orbit automation status --json
pnpm --filter @orbit/cli orbit context today --json
pnpm --filter @orbit/cli orbit handoff today --json
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
```

Expected:

- Today can be refreshed from a single visible automation run.
- Handoff is refreshed without including raw private payloads.
- Every skipped or blocked path is visible in CLI/Desktop.

---

## Goal 6: Model-Backed Semantics With Review Control

**Outcome:** Knowledge drafting, Memory candidate extraction, and Recommendations can use configured providers under strict schemas and evidence validation while remaining useful with all providers disabled.

**Files:**

- Modify `packages/ai/src/providerRegistry.ts`
- Create `packages/ai/src/tasks/knowledge.ts`
- Create `packages/ai/src/tasks/memory.ts`
- Create `packages/ai/src/tasks/recommendation.ts`
- Modify `packages/ai/src/tasks/vision.ts`
- Modify `packages/ai/src/tasks/transcription.ts`
- Modify `packages/core/src/knowledge/draftKnowledgeArtifact.ts`
- Modify `packages/core/src/memory/extractMemoryCandidates.ts`
- Modify `packages/core/src/recommendation/generateRecommendations.ts`
- Modify `packages/db/src/semanticPipeline.ts`
- Add evaluation fixtures under `fixtures/evals/`
- Modify `docs/semantic-quality-evaluation.md`

### Tasks

- [ ] Define strict JSON schemas for Knowledge, Memory candidates, and Recommendations.
- [ ] Validate every model-produced evidence ID against available Events/Activity/Knowledge/Memory.
- [ ] Reject or repair unsupported claims with deterministic fallback.
- [ ] Generate Memory candidates only from confirmed Knowledge.
- [ ] Keep all Memory candidates in `needs_review`.
- [ ] Add duplicate and supersession checks for Memory candidates.
- [ ] Add Recommendation duplicate suppression and terminal-state preservation.
- [ ] Add Chinese-only and mixed Chinese/English fixtures.
- [ ] Add semantic eval commands with unsupported-claim, evidence-coverage, duplicate, and language metrics.
- [ ] Commit with `feat: add evidence-validated semantic model jobs`.

### Acceptance Commands

```bash
rm -rf .tmp/usable-6
export ORBIT_HOME="$PWD/.tmp/usable-6"
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/ai test
pnpm --filter @orbit/core test
pnpm --filter @orbit/cli orbit ai status --json
pnpm --filter @orbit/cli orbit ai test --task knowledge_draft --json
pnpm --filter @orbit/cli orbit pipeline run --ai --json
pnpm --filter @orbit/cli orbit memory list --json
pnpm --filter @orbit/cli orbit recommendation list --json
```

Expected:

- Providers disabled: deterministic fallback still produces usable Today/Handoff.
- Providers enabled: model output is schema-valid and evidence-backed.
- Unsupported evidence IDs are rejected or repaired.

Gate 2 is complete after Goals 4-6 pass and a local dogfood day produces real Activity, Knowledge drafts, Memory candidates, Recommendations, Today, and Handoff from opt-in sources.

---

## Goal 7: Reliability, Performance, Privacy, And Support Bundle

**Outcome:** Orbit can handle realistic local data volume and failures without corrupting user data or hiding privacy decisions.

**Files:**

- Create `packages/db/src/debugBundle.ts`
- Create `packages/db/src/debugBundle.test.ts`
- Modify `packages/db/src/localDataOperations.ts`
- Modify `packages/db/src/migrate.ts`
- Modify `packages/db/src/privacyCleanup.ts`
- Modify `packages/privacy/src/index.ts`
- Modify `apps/desktop/src/routes/SettingsPage.tsx`
- Modify `apps/cli/src/index.ts`
- Create `apps/cli/src/commands/debugBundle.ts`
- Modify `docs/release-readiness-spec.md`
- Modify `docs/privacy-permissions.md`
- Modify `docs/alpha-test-strategy.md`

### Tasks

- [ ] Add a local debug bundle command and Desktop action that excludes raw payloads by default.
- [ ] Include app version, OS version, settings without secrets, source metadata, migration status, counts, recent audit operations, warnings, errors, redaction summary, and provider policy summary.
- [ ] Add migration tests for empty DB, current Alpha DB fixture, and latest DB.
- [ ] Add synthetic medium and large store performance tests for initial load, re-index, search, and Handoff generation.
- [ ] Add source failure isolation tests proving one bad source does not block other sources.
- [ ] Add privacy cleanup tests for raw text, OCR text, transcripts, raw sidecars, and failed redaction.
- [ ] Add support docs for local-only recovery, export, clear data, and downgrade block behavior.
- [ ] Commit with `feat: add reliability and support gates`.

### Acceptance Commands

```bash
rm -rf .tmp/usable-7
export ORBIT_HOME="$PWD/.tmp/usable-7"
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/cli orbit debug-bundle create --json
pnpm --filter @orbit/cli orbit perception cleanup --dry-run --json
pnpm --filter @orbit/cli orbit perception release-gate --json
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
```

Expected:

- Debug bundle contains no raw Event text, screenshots, audio, transcripts, API keys, private message bodies, full command output, or full document/mail content.
- Re-index and ingestion are idempotent on large synthetic stores.

---

## Complete-Product Scenario Coverage Matrix

The goals above move Orbit to a useful Beta. A "complete product" claim additionally requires the
scenario coverage below. Each row must have automated coverage where practical and a short manual
dogfood note where the behavior depends on macOS permissions or human judgment.

| Scenario | Minimum source mix | Required product output | Hard acceptance |
| --- | --- | --- | --- |
| Daily Review | Codex/local-agent plus Tier 1 observation | Today summary, open review queue, active Recommendations | User understands the day in under 30 seconds and can open evidence for each important claim. |
| Project Recall | Multi-day Codex/local-agent plus confirmed Memory | Project context, decisions, blockers, active Memory, Handoff | A new agent can continue the project without asking the user to restate recent context. |
| Debugging Recap | Commands, test failures, code-change notes, chat/imported notes | Knowledge draft with symptoms, attempted fixes, root cause, verification, follow-ups | Recap is useful without reading raw logs and every root-cause claim has evidence. |
| Meeting Or Discussion Summary | Approved chat import, transcript import, calendar/mail/docs when available | Knowledge draft with participants, decisions, action items, risks, open questions | Follow-ups become Recommendations and durable decisions can become Memory candidates. |
| Agent Handoff | Confirmed Knowledge, confirmed Memory, active Recommendations | Markdown/JSON Handoff plus read-only Agent API/MCP resource | Drafts, unconfirmed Memory, raw payloads, secret content, and non-exportable sources are excluded with reasons. |
| Privacy Audit | Any configured source | Source policy, audit log, debug bundle, exclusion reasons | User can answer what Orbit read, saved, summarized, exported, excluded, and deleted. |
| Failure Recovery | One healthy source plus one failing source | Visible warning/error, partial Today/Handoff refresh, debug bundle | One bad source never blocks other sources or corrupts local state. |
| Clean Install | No existing DB | First-run onboarding, empty states, source setup, pause/quit/clear data | App reads no private paths before explicit setup and can be operated without developer tools. |

### Complete-Product Additions After Gate 3

Gate 3 is external Beta. To become a fuller product, continue in source-by-source branches and keep
the same adapter contract.

Required post-Gate-3 goals:

1. **Calendar read-only adapter**: OAuth or local export, calendar scope disclosure, meeting metadata
   summaries, no default raw notes export.
2. **Mail read-only adapter**: OAuth or approved export, mailbox/folder allowlist, confidential by
   default, no raw body export by default.
3. **Docs/notes adapter**: explicit folder or OAuth scope, document title/summary/evidence pointers,
   clear retention and AI policy.
4. **Task/repo adapters**: Jira/GitLab/GitHub issue and repository metadata, explicit scope, no
   writes.
5. **SeaTalk approved path**: only if a stable approved API/export path exists; no scraping.
6. **Project recall UI**: project page or search mode that groups Activity, Knowledge, Memory,
   Decisions, Recommendations, and Handoff.
7. **Memory lifecycle maturity**: supersession, valid dates, review reminders, deletion/export, and
   version history in Desktop.
8. **Semantic quality evaluation**: repeatable eval thresholds for Chinese, English, mixed-language,
   unsupported-claim rejection, duplicate Memory suppression, and Recommendation ranking.

These additions are not prerequisites for Gate 2 daily Alpha, but they are prerequisites before
claiming complete product coverage beyond engineering dogfood.

---

## Goal 8: External Beta Packaging And Clean-Machine Release Gate

**Outcome:** Orbit can be installed by a non-developer on macOS with signing/notarization, a stable app identity, and a clean-machine smoke path.

**Files:**

- Modify `apps/desktop/electron-builder.yml`
- Modify `apps/desktop/package.json`
- Add app icon assets under `apps/desktop/build/`
- Create `apps/desktop/scripts/package-smoke.mjs`
- Create `apps/desktop/scripts/notarize-check.mjs`
- Modify `docs/alpha-release-checklist.md`
- Modify `docs/release-readiness-spec.md`
- Create `docs/beta-installation-guide.md`
- Create `docs/clean-machine-smoke.md`

### Tasks

- [ ] Add stable bundle ID, app category, icons, version metadata, and build metadata.
- [ ] Add signed DMG and optional ZIP targets behind explicit signing environment variables.
- [ ] Add notarization support behind CI/local keychain secrets.
- [ ] Add clean-machine smoke instructions for first launch, permissions, source setup, pause/resume, re-index, Handoff copy, clear data, and quit.
- [ ] Add packaging smoke automation that verifies the packaged app launches, main window opens, menu bar state appears, and no private default paths are read.
- [ ] Keep unsigned local `package:dir` available for development.
- [ ] Commit with `chore: add beta packaging release gate`.

### Acceptance Commands

```bash
rm -rf .tmp/usable-8
export ORBIT_HOME="$PWD/.tmp/usable-8"
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
pnpm --filter @orbit/desktop package:dir
pnpm --filter @orbit/desktop package:dmg
pnpm --filter @orbit/cli orbit perception release-gate --json
pnpm --filter @orbit/cli orbit automation release-gate --json
pnpm --filter @orbit/cli orbit status --json
```

Expected:

- Unsigned local package remains available for development.
- Signed/notarized release requires explicit credentials and fails clearly when credentials are absent.
- Clean-machine manual smoke is documented and repeatable.

Gate 3 is complete after Goal 8 passes on a clean macOS user account and the app is signed/notarized.

---

## Final Complete-Product Expansion

After Gate 3, continue only source-by-source. Each new production source must satisfy `docs/source-adapter-complete-contract.md` before it is enabled in a user build.

Recommended order:

1. Calendar read-only adapter.
2. Mail read-only adapter.
3. Docs read-only adapter.
4. Jira/GitLab read-only adapters.
5. SeaTalk direct read path only if a stable approved API or export path exists.
6. MCP/local HTTP server and Skill wrapper for read-only agent access.

Each adapter must include:

- explicit setup UI,
- source policy display,
- cursor semantics,
- malformed input handling,
- privacy minimization,
- audit logs,
- fixture/eval coverage,
- no source-side writes.

## Full Usability Gate

Run before claiming "truly usable":

```bash
rm -rf .tmp/usable-full
export ORBIT_HOME="$PWD/.tmp/usable-full"
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/ai test
pnpm --filter @orbit/privacy test
pnpm --filter @orbit/adapters test
pnpm --filter @orbit/desktop test
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
pnpm --filter @orbit/desktop package:dir
pnpm --filter @orbit/cli orbit status --json
pnpm --filter @orbit/cli orbit observe status --json
pnpm --filter @orbit/cli orbit perception status --json
pnpm --filter @orbit/cli orbit perception release-gate --json
pnpm --filter @orbit/cli orbit ai status --json
pnpm --filter @orbit/cli orbit automation status --json
pnpm --filter @orbit/cli orbit automation run-once --json
pnpm --filter @orbit/cli orbit context today --json
pnpm --filter @orbit/cli orbit handoff today --json
pnpm --filter @orbit/cli orbit agent resources --json
pnpm --filter @orbit/cli orbit agent read orbit://handoff/today --json
pnpm --filter @orbit/cli orbit debug-bundle create --json
```

Manual checks:

- Fresh install on a clean macOS user.
- No source reads private data before explicit setup.
- User can add one explicit local source and ingest it.
- Tier 1 background observation can start, pause, resume, stop.
- Live perception can start, pause, resume, stop, delete after explicit permission and scope.
- Protected apps suppress capture before persistence.
- Today explains collection, processing, skipped, and blocked states.
- Knowledge/Memory/Recommendation review actions work, including confirmed Knowledge generating a
  reviewed Memory that enters Handoff.
- Handoff excludes unsafe content and includes evidence pointers.
- Read-only Agent interface returns the same safe Handoff shape as CLI/Desktop preview.
- Clear local data requires confirmation and writes audit log.
- Debug bundle excludes raw payloads and secrets.
- Product scenario dogfood notes exist for Daily Review, Project Recall, Debugging Recap, Meeting or
  Discussion Summary, Agent Handoff, Privacy Audit, Failure Recovery, and Clean Install.

## Plan Self-Review

- Spec coverage: This plan maps Alpha loops from `docs/alpha-product-closure-spec.md`, Goal 9 checkpoints from `docs/llm-perception-and-context-automation-plan.md`, the Goal 9D blocker, release gates from `docs/release-readiness-spec.md`, source requirements from `docs/source-adapter-complete-contract.md`, and semantic evaluation needs from `docs/semantic-quality-evaluation.md`.
- Placeholder scan: No task depends on an undefined subsystem; every production capture path is explicitly scoped to macOS helper, ScreenCaptureKit, Apple Vision OCR, AVFoundation/audio path, queueing, policy, and audit.
- Type consistency: The plan keeps existing product objects and terms: Event, Activity Session, Knowledge Artifact, Memory, Recommendation, Handoff, Source Adapter, PermissionScope, perception source policy, provider route, and audit log.
- Scope check: This is intentionally a multi-goal roadmap. Implement each goal independently; do not batch it into one giant change.
