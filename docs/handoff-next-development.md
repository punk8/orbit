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

- Existing local databases may contain old source records created before `sources.adapterConfigs`. Those sources can show `Missing adapter path; reconfigure this source before background collection.` Reconfigure or disable them from Sources.
- Existing Events inserted before the privacy gate may still contain old `content.text`. Fresh ingestion applies the new policy, but a dedicated old-data privacy migration/cleanup has not been implemented.
- Source permission policies are visible but not yet user-editable from the UI.
- `packages/agent-api` is still a placeholder. CLI context commands are the only usable agent interface right now.
- MCP/local HTTP server/Skill wrapper are not implemented yet.
- No screen capture, OCR, audio transcription, active app/window accessibility capture, or calendar/mail/Jira/GitLab adapters have been implemented.
- SeaTalk remains approved-import-only. Do not add speculative scraping.
- Packaging is unsigned and not notarized. See `docs/alpha-release-checklist.md`.

## Recommended Next Goal

Recommended next goal:

```text
Goal 6: Source Reconfiguration And Privacy Cleanup
```

After Goal 6, the next product-shaping goal should be Handoff Pack CLI and desktop review/copy UX. Handoff Pack is now a first-class Orbit output, defined in `docs/handoff-pack.md`, and should become the first agent-facing warm-start surface before broader MCP, screen capture, or automation work.

Why this should be next:

- The app now has background runtime and permission gates, but old/local source configuration can still be confusing.
- Privacy defaults apply to fresh ingestion, but old event rows may predate the new raw-text minimization policy.
- Before adding MCP, screen capture, or more real sources, users need clearer source management and cleanup controls.

Suggested scope:

- Add source reconfigure flow for existing source records.
- Show exact adapter path/interface for every configured source.
- Let users disable or delete source records with confirmation.
- Add source-level re-ingest/reset cursor action.
- Add one-time privacy cleanup command/action for old Events:
  - redact text fields
  - drop raw text when source policy disallows raw storage
  - update `redactionState`
  - write audit logs
- Add a small audit viewer or source audit summary in Settings/Sources.
- Keep SeaTalk approved-import-only.
- Do not add screen/OCR/MCP in this goal.

Suggested acceptance commands:

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

Functional acceptance:

- A user can fix an old `Missing adapter path` source without deleting the whole DB.
- A user can disable/delete a source with confirmation and audit.
- A source can be re-ingested after cursor reset without duplicating Events.
- Old Events can be privacy-cleaned without losing Activity/Knowledge evidence pointers.
- Context export remains raw-private-data-safe by default.

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
