# Handoff: Next AI Provider Work

This document is the continuation note for developing Orbit on another machine.

## Repository

```bash
git clone https://github.com/punk8/orbit.git
cd orbit
pnpm install
```

Node requirement:

```bash
node --version # >= 22
pnpm --version # current repo uses pnpm 10.14.0
```

## Current State

Latest pushed commits:

- `c56f3e8 Initial Orbit implementation`
- `ff5417d Alpha hardening and packaging`

Orbit is currently a local-first Alpha skeleton with a working end-to-end context loop:

```text
Source Adapter -> Event -> Activity Session -> Knowledge Artifact -> Memory -> Recommendation
```

Implemented:

- Monorepo packages: `core`, `db`, `adapters`, `ai`, `privacy`, `agent-api`, `ui`.
- CLI app under `apps/cli`.
- Electron desktop app under `apps/desktop`.
- SQLite local store with migrations and repositories.
- Source adapters:
  - synthetic fixtures
  - Codex JSON/JSONL explicit path
  - generic local agent JSON/JSONL explicit path
  - SeaTalk approved import only
- Realistic sanitized fixtures under `fixtures/realistic`.
- Knowledge review governance:
  - `confirm`
  - `reject`
  - `archive`
  - `edit`
- Memory governance:
  - Memory candidates are generated only from confirmed Knowledge.
  - Memory review supports `confirm`, `reject`, `archive`, `edit`.
- Recommendation governance:
  - `accept`
  - `dismiss`
  - `snooze`
  - `resolve`
- Audit logs for review/governance/data operations.
- Desktop UI pages:
  - Today
  - Activity
  - Knowledge
  - Memory
  - Recommendations
  - Review Queue
  - Sources
  - Settings
- Desktop runtime settings:
  - menu bar residency
  - launch at login
  - configured database path, applied on next launch through `runtime-config.json`
  - re-index
  - clear local data
  - export context
- Electron packaging:
  - `package:dir`
  - `package:dmg`
  - unsigned Alpha DMG

Out of scope / not implemented yet:

- Real LLM provider.
- Real embedding provider.
- Real SeaTalk API integration.
- Screen sampling / visual context input.
- OCR / VLM.
- Strong privacy layer: redaction, retention, encryption, pause/resume, per-app exclusions.
- Auto-update, signing, notarization, crash reporting.

## Verify After Clone

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/adapters test
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
```

Packaging checks:

```bash
pnpm --filter @orbit/desktop package:dir
pnpm --filter @orbit/desktop package:dmg
```

Important native module note:

`electron-builder` rebuilds `better-sqlite3` for Electron ABI. If `pnpm test` later reports a `NODE_MODULE_VERSION` mismatch, run:

```bash
pnpm rebuild better-sqlite3
```

## Useful Manual Commands

Ingest fixtures:

```bash
pnpm --filter @orbit/cli orbit ingest fixtures --json
```

Ingest realistic Codex samples:

```bash
pnpm --filter @orbit/cli orbit ingest codex --path fixtures/realistic/codex --json
```

Ingest realistic local agent samples:

```bash
pnpm --filter @orbit/cli orbit ingest local-agent --path fixtures/realistic/local-agent --json
```

Review flow:

```bash
pnpm --filter @orbit/cli orbit knowledge list --json
pnpm --filter @orbit/cli orbit knowledge confirm <knowledge-id> --json
pnpm --filter @orbit/cli orbit memory list --json
pnpm --filter @orbit/cli orbit memory confirm <memory-id> --json
```

Desktop app:

```bash
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop package:dir
open apps/desktop/release/mac-arm64/Orbit.app
```

## Next Goal: API Provider Support

Goal:

Add API-based AI provider support without binding Orbit to Codex auth or any single vendor.

Recommended provider model:

```text
disabled
mock
openai-compatible
```

Do not use Codex auth as Orbit's LLM credential source.

Reason:

- Codex auth is owned by Codex, not Orbit.
- Token/session format may change.
- Product privacy and cost boundaries become unclear.
- Orbit should expose its own provider config, audit, and user-visible controls.

### First Implementation Scope

Implement only `draftKnowledge` first.

Do not yet wire LLM into:

- Memory candidate extraction
- Recommendation generation
- Context pack compression
- Any side-effecting automation

### Target Architecture

Add or complete the provider abstraction in `packages/ai`:

```ts
interface AIProvider {
  id: string;
  kind: "disabled" | "mock" | "openai-compatible";
  draftKnowledge(input: DraftKnowledgeInput): Promise<DraftKnowledgeOutput>;
}
```

Expected future methods, not necessarily first goal:

```ts
extractMemoryCandidates(...)
generateRecommendations(...)
compressContextPack(...)
embedText(...)
```

### Provider Configuration

Minimum settings:

- provider kind: `disabled | mock | openai-compatible`
- base URL
- model
- API key reference

Security expectation:

- API key should not be stored in SQLite plaintext.
- Prefer OS Keychain for desktop.
- For CLI development, allow env var fallback:

```bash
ORBIT_AI_PROVIDER=openai-compatible
ORBIT_OPENAI_BASE_URL=https://api.openai.com/v1
ORBIT_OPENAI_MODEL=<model>
ORBIT_OPENAI_API_KEY=<key>
```

Desktop settings can start by showing provider fields, but avoid persisting plaintext API keys.

### Prompt Contract

The model must output strict JSON. Suggested output shape:

```json
{
  "title": "string",
  "description": "string",
  "keyInsights": [
    {
      "text": "string",
      "evidenceIds": ["event_or_activity_id"]
    }
  ],
  "decisions": [
    {
      "text": "string",
      "evidenceIds": ["event_or_activity_id"]
    }
  ],
  "blockers": [
    {
      "text": "string",
      "evidenceIds": ["event_or_activity_id"]
    }
  ],
  "followUps": [
    {
      "title": "string",
      "evidenceIds": ["event_or_activity_id"]
    }
  ],
  "confidence": 0.0
}
```

Rules:

- Every insight/decision/blocker/follow-up must reference provided evidence IDs.
- Drop any model output item with no valid evidence reference.
- Never allow the model to invent source pointers.
- If the provider fails, fall back to deterministic local drafting.

### Pipeline Integration Point

Current deterministic drafting is here:

- `packages/core/src/knowledge/draftKnowledgeArtifact.ts`
- `packages/db/src/semanticPipeline.ts`
- CLI re-export: `apps/cli/src/commands/semanticPipeline.ts`

Recommended integration:

1. Keep deterministic `draftKnowledgeArtifact` as fallback.
2. Add an async pipeline variant that can accept an `AIProvider`.
3. Start with CLI command support:

```bash
pnpm --filter @orbit/cli orbit pipeline run --ai --json
```

or use config/env automatically.

4. Desktop can call the same DB-level pipeline through IPC once provider settings exist.

### Tests And Acceptance

Required tests:

- Mock provider produces valid Knowledge with evidence.
- OpenAI-compatible provider can be tested with a fake local HTTP server, not a live API.
- Invalid JSON response falls back or fails gracefully.
- Output items with unknown evidence IDs are dropped.
- Re-running pipeline does not overwrite reviewed Knowledge.
- Provider-disabled mode keeps all current tests deterministic.

Acceptance commands:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/cli orbit ingest fixtures --json
pnpm --filter @orbit/cli orbit pipeline run --json
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
```

Optional manual provider smoke:

```bash
ORBIT_AI_PROVIDER=openai-compatible \
ORBIT_OPENAI_BASE_URL=https://api.openai.com/v1 \
ORBIT_OPENAI_MODEL=<model> \
ORBIT_OPENAI_API_KEY=<key> \
pnpm --filter @orbit/cli orbit pipeline run --json
```

## Product Boundary For This Goal

Use LLM to improve Knowledge quality only.

Do not send raw screenshots, raw chats, private code, or full raw Event payloads by default.

Preferred context sent to provider:

- event title
- event summary/text excerpt after future redaction
- source kind
- timestamp
- app/project metadata
- stable evidence ID

The user-visible object remains a draft Knowledge Artifact requiring review.

## Recommended Commit Shape

One commit for provider infrastructure:

```text
Add AI provider abstraction for knowledge drafting
```

If the change becomes large, split:

1. Provider abstraction and fake HTTP tests.
2. Pipeline integration.
3. CLI/env configuration.
4. Desktop settings display.
