# Handoff: Next Orbit Development

Last updated: 2026-05-21

This document is the current continuation note for developing Orbit on another machine. It supersedes the older AI-provider-focused handoff for day-to-day planning, while `docs/handoff-next-ai-provider.md` remains useful historical context for the provider work.

## Repository Setup

```bash
git clone git@github.com:punk8/orbit.git
cd orbit
pnpm install
```

Expected local stack:

```bash
node --version # >= 22; recent local validation used Node v24.9.0
pnpm --version # repo packageManager is pnpm 10.14.0
```

Useful first checks:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
pnpm --filter @orbit/cli orbit status --json
```

Packaging note:

```bash
pnpm --filter @orbit/desktop package:dir
pnpm rebuild better-sqlite3
```

`package:dir` rebuilds `better-sqlite3` for Electron ABI. Run `pnpm rebuild better-sqlite3` afterward before Node/CLI tests if a `NODE_MODULE_VERSION` mismatch appears.

## Latest Pushed Commits

Recent commits on `main`:

- `42f65f7 Add privacy permission gates`
- `a5e9e68 Add background runtime controls`
- `43371e7 Make AI provider token limits configurable`
- `f4915c0 Add AI provider connection test`
- `ac44701 Add settings subnavigation`
- `bdba614 Add OpenAI-compatible knowledge provider`
- `22b7e3c Polish desktop Chinese UI`
- `4197be6 Add multilingual desktop support`

Remote push from the original machine used:

```bash
GIT_SSH_COMMAND='ssh -i ~/.ssh/id_rsa -o IdentitiesOnly=yes' git push
```

Use the appropriate SSH key on the new machine.

## Current Product State

Orbit is now a local-first Alpha skeleton with a working end-to-end context loop:

```text
Source Adapter -> Event -> Activity Session -> Knowledge Artifact -> Memory -> Recommendation
```

Implemented and recently verified:

- pnpm TypeScript monorepo with `core`, `db`, `adapters`, `ai`, `privacy`, `agent-api`, `ui`, CLI, and Electron desktop app.
- SQLite local store with migrations:
  - `0001_initial`
  - `0002_source_runtime`
  - `0003_source_permissions`
- Source adapters:
  - synthetic fixtures
  - explicit-path Codex local sessions
  - explicit-path generic local agent sessions
  - approved SeaTalk import only
- CLI commands for status, ingestion, pipeline, Activity/Knowledge/Memory/Recommendation reads, review actions, and context packs.
- Electron desktop shell with Today, Activity, Knowledge, Memory, Recommendations, Review Queue, Sources, and Settings.
- Chinese/English desktop i18n, with Chinese as first-class UI support.
- Settings subnavigation for AI Provider, Runtime, Storage, and Data Operations.
- OpenAI-compatible `/v1/chat/completions` provider for Knowledge drafting.
- Desktop provider config with provider kind, base URL, model, encrypted API key, token parameter, draft max tokens, test max tokens, and test connection.
- Background runtime loop in Electron:
  - starts on app launch
  - runs authorized source ingestion on interval
  - supports global pause/resume
  - supports per-source pause/resume/enable/disable
  - exposes runtime status in tray/sidebar/settings
- Privacy permission gate:
  - every adapter declares a `permissionScope`
  - source permission scope is persisted in SQLite
  - ingestion rejects adapters without permission scope
  - ingestion applies deterministic redaction and raw-text minimization
  - default source policy does not store raw text
  - confidential/secret content is blocked from external AI by default
  - AI draft calls write local audit logs
  - CLI context/export defaults include confirmed Knowledge/Memory only
  - Sources UI displays source permissions, readable fields, raw storage policy, AI policy, export policy, and adapter interface
  - desktop clear-local-data action has a confirmation boundary
- Goal 7 agent continuity work on branch `codex/goal-7-agent-continuity`:
  - privacy-safe Handoff Pack builder in `@orbit/core`
  - DB assembly and local `handoff.generate` audit logging
  - `orbit handoff today --json`
  - `orbit handoff today --format markdown`
  - `orbit handoff project <name> --json`
  - `orbit handoff project <name> --format markdown`
  - Desktop Handoff page for local generate, preview, and copy
  - read-only agent resource descriptors for `orbit://handoff/today` and `orbit://handoff/project/<name>`
  - hardened explicit-path Codex/local-agent fixture coverage for nested directories, `.json` arrays, malformed JSONL warnings, stable pointers, and cursor idempotency
  - screen/audio research and disabled capability descriptors; no raw capture implementation

## Important Current Behavior

Fresh ingestion after `42f65f7` applies privacy policy. Default behavior converts raw `content.text` into a bounded summary and removes raw text unless a source explicitly allows raw storage.

External AI payloads are minimized. Draft Knowledge provider input includes only policy-allowed events and bounded excerpts/summaries, and filters:

- `secret` events
- events with `redactionState: failed`
- sources whose permission scope disallows AI
- confidential events unless their source explicitly allows AI

Agent-facing context defaults are now conservative:

- `orbit context today --json` includes Activity summaries, confirmed Knowledge, confirmed Memory, and evidence-backed Recommendations.
- Draft Knowledge and candidate Memory are not included by default.
- Context export uses the same summary/confirmed default and writes audit metadata.

## Known Issues / Watchouts

- Existing local databases may contain old source records created before `sources.adapterConfigs`. Sources now exposes a reconfigure action so a user can attach the missing adapter path/interface without deleting the database.
- Existing Events inserted before the privacy gate may still contain old `content.text`. Sources now exposes legacy privacy cleanup, which removes raw event text when the source policy disallows raw storage while preserving summaries and evidence pointers.
- Source permission policies are visible but not yet user-editable from the UI.
- `packages/agent-api` exposes read-only handoff resource descriptors, but there is still no running MCP server or local HTTP agent API.
- MCP/local HTTP server/Skill wrapper are not implemented yet.
- No screen capture, OCR, audio transcription, active app/window accessibility capture, or calendar/mail/Jira/GitLab adapters have been implemented.
- SeaTalk remains approved-import-only. Do not add speculative scraping.
- Packaging is unsigned and not notarized. See `docs/alpha-release-checklist.md`.

## Goal 7: Agent Continuity And Perception Readiness

Status: in progress on branch `codex/goal-7-agent-continuity`.

Base commit before Goal 7 implementation:

- `2507788 docs: plan agent continuity goal`

Update this section with the final commit hash after the checkpoint commit lands.

Implemented scope:

- Handoff Pack domain builder and Markdown formatter.
- Default Handoff Pack privacy exclusions for draft Knowledge, unconfirmed Memory, terminal Recommendations, missing evidence, secret content, failed redaction, and sources that disallow agent export.
- Evidence index with compact source pointers instead of raw Event text.
- DB assembly for today/project Handoff Packs with local `handoff.generate` audit logs.
- CLI handoff commands:
  - `orbit handoff today --json`
  - `orbit handoff today --format markdown`
  - `orbit handoff today --date <YYYY-MM-DD>`
  - `orbit handoff project <name> --json`
  - `orbit handoff project <name> --format markdown`
- Desktop Handoff route:
  - sidebar navigation item
  - generate today handoff
  - generate project handoff
  - preview Markdown locally
  - copy Markdown to clipboard
  - safety boundary and evidence summaries
  - English and Chinese i18n strings
- Codex/local-agent adapter hardening tests for explicit local paths:
  - nested directories
  - `.json` array fixtures
  - malformed JSONL warnings
  - deterministic source pointers
  - cursor idempotency
- Agent API descriptor builders:
  - `orbit://handoff/today`
  - `orbit://handoff/project/<name>`
  - read-only Markdown descriptors only
- Screen/audio perception readiness:
  - `SourceKind` now includes `audio`
  - disabled descriptors for screen and audio are exported from `@orbit/core`
  - descriptors are `research_only`, disabled by default, permission-required, non-capturing, and blocked from default agent export
  - [Perception Research Spike](./perception-research-spike.md) documents the future macOS path and production-capture gate

Exact acceptance commands for final Goal 7 verification:

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

Goal 7 watchouts:

- Handoff generation is local read-only assembly. It does not send content to agents automatically.
- `--format markdown` is the only non-JSON format implemented; unsupported format validation can be tightened later.
- Desktop copy uses the user's clipboard, but there is no external send/share action.
- Agent API is descriptor-only. MCP/local HTTP serving remains later work.
- Screen/audio are visible as future capabilities only. Do not add ScreenCaptureKit, OCR, microphone, transcription, or raw media storage without passing the production-capture gate in `docs/perception-research-spike.md`.

## Goal 6: Source Reconfiguration And Privacy Cleanup

Status: completed on branch `codex/goal-6-source-privacy-cleanup`.

Implemented scope:

- Source cursor reset in the DB repository and Desktop Sources UI.
- Source delete in the DB repository and Desktop Sources UI, with adapter config cleanup and audit logging.
- Source reconfigure action for existing source records so old records missing `sources.adapterConfigs` can be repaired.
- Source cursor presence in the Desktop snapshot and Sources UI.
- Legacy privacy cleanup for old Events that still contain `content.text` when their source policy disallows raw storage.
- Desktop action and Sources UI confirmation for legacy privacy cleanup.
- Focused tests for DB source controls, legacy privacy cleanup, preload API exposure, and Sources UI control presence.

After Goal 6, the next product-shaping goal should be Handoff Pack CLI and desktop review/copy UX. Handoff Pack is now a first-class Orbit output, defined in `docs/handoff-pack.md`, and should become the first agent-facing warm-start surface before broader MCP, screen capture, or automation work.

Required acceptance commands:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/adapters test
pnpm --filter @orbit/cli orbit ingest fixtures --json
pnpm --filter @orbit/cli orbit context today --json
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
pnpm --filter @orbit/desktop package:dir
pnpm rebuild better-sqlite3
pnpm --filter @orbit/cli orbit status --json
```

Latest local result: all required commands passed. Run `pnpm --filter @orbit/desktop test:e2e` separately from `pnpm --filter @orbit/desktop package:dir`; both touch the packaged app path and can race if run in parallel.

Functional acceptance:

- A user can fix an old `Missing adapter path` source without deleting the whole DB.
- A user can disable/delete a source with confirmation and audit.
- A source can be re-ingested after cursor reset without duplicating Events.
- Old Events can be privacy-cleaned without losing Activity/Knowledge evidence pointers.
- Context export remains raw-private-data-safe by default.

Remaining watchout:

- Sources has cleanup actions and source-level runtime controls, but it does not yet provide a full audit log viewer. Audit entries are written locally and can be surfaced in a later Knowledge/Memory detail or Settings audit view.

## Later High-Value Goals

After source cleanup, likely next goals:

1. **Knowledge And Memory Detail UX**
   - Detail panes for Activity, Knowledge, Memory, Recommendations.
   - Edit Knowledge/Memory from desktop UI.
   - Copy Markdown.
   - Evidence expansion and source pointer display.

2. **Agent Interface**
   - Treat Handoff Pack as the first agent-facing product output.
   - Add `orbit handoff today` and `orbit handoff project <name>` in Markdown and JSON.
   - Read-only local HTTP or MCP over the same context/search APIs.
   - Expose MCP resources such as `orbit://handoff/today` after the CLI shape stabilizes.
   - Keep default agent access read-only.
   - Writes require explicit confirmation and audit.

3. **Handoff Pack Desktop UX**
   - Add "Generate Agent Handoff" from Today and project/context views.
   - Let users review/copy the pack before giving it to Codex, Claude Code, or another agent.
   - Default to confirmed Knowledge/Memory and source-backed Activity summaries.
   - Mark any optional draft or unconfirmed content clearly.

4. **Markdown/JSON Artifact Sidecars**
   - Human-readable Knowledge and Memory files.
   - SQLite/FTS remains rebuildable sidecar.
   - Export/import and audit alignment.

5. **Real Source Reliability**
   - Harden explicit-path Codex/local-agent adapters further.
   - Decide safe SeaTalk read path.
   - Do not scrape SeaTalk unless a permissioned read interface exists.

6. **Release Hardening**
   - DMG/zip artifacts.
   - signing/notarization.
   - clean macOS account smoke test.
   - icon/app metadata.

## Do Not Accidentally Do Next

Avoid bundling these into the next checkpoint unless explicitly chosen:

- screen recording
- OCR/VLM
- audio transcription
- cloud sync
- hosted backend
- automatic message sending
- automatic code changes
- external task creation
- speculative SeaTalk scraping
- MCP write workflows

Orbit should first become a reliable, inspectable, local context system before adding higher-risk capture or automation.
