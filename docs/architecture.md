# Architecture

## Overview

Orbit should be built around stable domain boundaries, not around a single data source. The long-term data flow is:

```text
Source Adapter
  -> Background Observation Runtime
  -> Event Ingestion
  -> Local Event Store
  -> Activity Session Builder
  -> Processing Pipeline
  -> Knowledge Artifact Store
  -> Memory Store
  -> Recommendation Engine
  -> Agent Interface / Desktop Shell
```

The core should be usable without the desktop UI. The Electron app is the shell for permissions, status, review, search, and user interaction.

## Recommended Stack

- **Language**: TypeScript for product code.
- **Desktop shell**: Electron.
- **Package manager**: pnpm.
- **Local database**: SQLite with WAL mode and FTS5.
- **Human-readable artifacts**: Markdown plus JSON frontmatter or sidecar metadata.
- **Vector search**: provider interface first; implementation can start with disabled or optional SQLite vector extension.
- **Local API**: loopback HTTP or IPC service owned by the Electron main process.
- **Agent interface**: CLI first, MCP second, Skill wrapper after CLI stabilizes.
- **Native helpers**: small macOS helpers only when Electron cannot safely handle active-window metadata, Accessibility, screen capture, Apple Vision OCR, audio capture, or permission checks.

## Module Boundaries

Suggested future repository shape:

```text
apps/
  desktop/              Electron app, tray/menu bar, settings, review UI
  cli/                  orbit command line interface
packages/
  core/                 domain types and use cases
  adapters/             Desktop observation, Codex, SeaTalk, Screen, future source adapters
  store/                SQLite, artifact files, indexes, migrations
  ai/                   provider interfaces and prompt orchestration
  agent-interface/      MCP server, skill helpers, local API clients
  privacy/              redaction, retention, permissions, policy checks
docs/
```

The first code milestone can collapse packages if needed, but these boundaries should remain visible in naming and module ownership.

## Runtime Topology

Orbit should run as a local background service with a desktop shell:

- Electron main process owns lifecycle, tray/menu, auto-start, and privileged local services.
- Renderer provides Activity, Knowledge, Memory, Recommendations, settings, and review screens.
- Core service exposes domain operations through IPC and optional localhost API.
- CLI talks to the same local service when running, or uses the local store directly for read-only commands.
- MCP server should be a thin adapter over the core read APIs.

## Background Observation Runtime

Background observation is a first-class runtime owned by the desktop shell. It continuously captures
authorized computer activity and normalizes it through the same Source Adapter and Event model as
explicit imports.

The first implementation should prioritize:

- active app/window changes,
- runtime permission state,
- Accessibility text snapshots after explicit permission,
- browser title/URL only through approved APIs, Accessibility, or extension paths,
- terminal command observation through approved shell integration or explicit logs,
- file activity under user-selected directories,
- clipboard capture only after explicit enablement.

Screen frames, OCR, audio, and transcripts are high-risk adapters. They must remain separately
gated until visible running state, pause/stop controls, protected-app exclusions, short retention,
redaction, audit logging, and CPU/storage budgets are complete.

See [Background Observation Core Spec](./background-observation-core-spec.md).

## Source Adapter Layer

Each adapter should implement the same responsibilities:

- Declare source identity, capabilities, permissions, and sensitivity defaults.
- Read incrementally from the source.
- Convert raw input into Events.
- Preserve source pointers and minimal raw references.
- Avoid business-specific summarization inside adapters.

Initial adapters:

- **Desktop observation adapter**: app/window focus, permission state, Accessibility snapshots, explicit folder activity, and other authorized local computer activity.
- **Codex adapter**: engineering sessions, commands, code changes, tests, conclusions.
- **SeaTalk adapter**: messages, unread mentions, private chats, group discussions, on-call events.

Future adapters:

- Screen/OCR, audio/transcript, calendar, email, docs, Jira, GitLab, repository, browser extension, local filesystem.

Screen and audio are first-class Source Adapters, but not first-step raw recording defaults. Their
production shape should prefer active app/window metadata and Accessibility text before
ScreenCaptureKit frames, OCR, microphone capture, or transcription. Raw perception data must stay
disabled until permission UX, visible running state, pause/stop controls, retention defaults,
exclusions, audit logging, redaction, and CPU/storage budgets are complete. See
[Perception Research Spike](./perception-research-spike.md).

## Event And Activity Flow

Events are append-oriented facts. Activity Sessions are derived groupings.

The Activity Session Builder should use:

- Time proximity.
- Source and app overlap.
- Project or repository hints.
- Conversation thread IDs.
- Command/session boundaries.
- AI topic classification when deterministic signals are insufficient.

An Activity Session should remain editable and reproducible. If grouping rules improve later, Orbit can rebuild sessions from Events.

## Knowledge Artifact Flow

Knowledge Artifacts are reviewable documents. They should not be silently treated as Memory.

Generation pipeline:

1. Select Activity Sessions or a time window.
2. Retrieve relevant Events and existing Memories.
3. Generate structured draft.
4. Attach source references and confidence.
5. Store as editable artifact.
6. Let user confirm, edit, pin, export, or mark as not useful.

Common artifact types:

- Daily brief.
- Weekly review.
- Meeting summary.
- Debugging note.
- Decision record.
- Project context recap.
- Follow-up list.

## Memory Flow

Memory is smaller and more stable than a Knowledge Artifact.

Memory creation should happen through one of these paths:

- User explicitly saves a Memory.
- User confirms suggestions extracted from Knowledge Artifacts.
- High-confidence system extraction enters a review queue before becoming active.

Memory should support:

- Version history.
- Evidence references.
- Confidence.
- Expiration or review dates.
- Project and source scope.
- Disable/delete controls.

## Hybrid AI Provider Abstraction

Orbit should treat "local-first" as a data, permission, storage, audit, and deletion guarantee.
It should not require every intelligence capability to run through a local LLM.

The durable architecture is a hybrid provider model:

- External frontier models can power high-quality generation, summarization, complex reasoning, and recommendation wording when the user explicitly configures them and the source policy allows it.
- Local models and platform services should power privacy-sensitive or high-frequency foundation tasks such as VAD, transcription, OCR, embedding, local indexing, redaction, and sensitivity classification.
- Deterministic fallbacks should remain available so Activity, Knowledge, Memory, Recommendation, Handoff, and search are useful even when no external provider is enabled.

This is the main product lesson from local model component signals such as `onnxruntime`,
`sherpa-onnx`, `model.int8.onnx`, `silero_vad.onnx`, local ONNX providers, and Ollama-style
local endpoints: they are more valuable as task-specific local infrastructure than as proof that
the whole product should default to a local general-purpose LLM.

The AI layer should expose task-oriented interfaces, not one global "model" knob:

- `summarizeActivity`
- `draftKnowledgeArtifact`
- `extractMemoryCandidates`
- `classifyEvent`
- `embedText`
- `rankRecommendations`
- `redactSensitiveText`
- `detectVoiceActivity`
- `transcribeAudio`
- `extractScreenText`

Provider choices should be implementation details behind those tasks:

- Deterministic local rules.
- Local ONNX providers.
- Apple platform services such as Vision where appropriate.
- Ollama or other local HTTP model endpoints.
- OpenAI-compatible endpoints.
- Claude/Gemini-style external model providers.
- Future hosted Orbit service.

Provider metadata must be visible and auditable. Generated Knowledge, Memory, Recommendation,
Handoff Packs, indexes, and transcripts should be able to answer:

- Which task produced this output.
- Which provider and model were used.
- Whether data left the machine.
- Which source policies allowed the operation.
- Which evidence IDs were included.
- Which audit log entry records the operation.

The domain layer should not import provider-specific SDKs.

## Agent Interface

External agents need read-first access to Orbit:

- Search Activity Sessions.
- Retrieve Knowledge Artifacts.
- Search Memories.
- Ask for today's context.
- Ask for project context.
- Ask for recommendation explanations.
- Ask for a Handoff Pack for a day, project, or current workstream.

A Handoff Pack is the agent warm-start surface over the same domain objects. It should assemble current objective, recent Activity, confirmed Knowledge, active Memories, evidence-backed Recommendations, safety boundaries, and compact source pointers. It is not a raw export and should not include draft Knowledge, unconfirmed Memory, or raw private payloads by default.

Handoff Pack does not require screen or audio capture. Future perception Events may contribute only after they are redacted, source-backed, and permitted for agent export. Raw screenshots, recordings, audio, transcripts, and failed-redaction perception data remain blocked from default handoffs.

Initial commands should include:

```bash
orbit handoff today --json
orbit handoff today --format markdown
orbit handoff project <name> --json
orbit handoff project <name> --format markdown
```

MCP and skill wrappers should expose the same read-only pack later, for example as `orbit://handoff/today` or a Codex/Claude skill that asks Orbit for a warm-start package before answering continuity-heavy requests. See [Handoff Pack](./handoff-pack.md).

Write operations require stronger policy:

- Create draft Knowledge Artifact: allowed with user-visible review.
- Write Memory: requires explicit confirmation or trusted policy.
- Trigger side-effect action: out of scope for the first development cycle.

## Desktop UI Areas

The first Electron UI should map directly to domain layers:

- **Activity**: timeline, session detail, source filters, local storage status.
- **Knowledge**: artifact list, artifact detail, metadata, source sessions, edit/review actions.
- **Memory**: grouped memories, search status, dimensions, review queue.
- **Recommendations**: attention list with basis, confidence, and action.
- **Settings**: adapters, permissions, retention, AI providers, local storage, export/delete.
