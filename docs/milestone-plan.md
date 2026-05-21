# Milestone Plan

## Development Strategy

Orbit should start with the semantic pipeline, not with full screen capture. Codex and SeaTalk have higher semantic density and lower technical risk than screen recording, so they are better first sources for proving the Event -> Activity -> Knowledge -> Memory chain.

## Milestone 0: Design Baseline

Goal: make the first implementation unambiguous.

Deliverables:

- Product principles.
- Architecture design.
- Data model.
- Privacy and permission model.
- First milestone plan.

Exit criteria:

- Core object names are stable.
- Data flow is agreed.
- First implementation boundaries are clear.

## Milestone 1: Local Core And Storage Spike

Goal: prove the local data foundation.

Scope:

- TypeScript core domain types.
- SQLite schema for Events, Activity Sessions, Knowledge Artifacts, Memories, Recommendations.
- FTS5 search over Knowledge and Memory.
- Markdown/JSON file writer for Knowledge and Memory.
- Basic migrations.
- Local fixture-based tests.

Acceptance criteria:

- Can insert fixture Events.
- Can build a fixture Activity Session.
- Can store and read a Knowledge Artifact.
- Can store and search a Memory.
- Can delete an object and remove related indexes.

## Milestone 2: Codex Adapter And Daily Knowledge Draft

Goal: ingest real engineering context from Codex and generate the first useful artifact.

Scope:

- Codex source adapter.
- Incremental cursor.
- Event normalization for sessions, commands, test results, code changes, and conclusions.
- Activity Session grouping.
- Daily brief generator using local fixtures first, then real data.
- Evidence references from Knowledge Artifact back to source Events.

Acceptance criteria:

- "What did I do today in Codex?" produces a traceable draft daily brief.
- The brief shows source sessions and evidence.
- User can confirm, edit, or reject the artifact.
- No raw data is stored without policy.

## Milestone 3: SeaTalk Adapter And Cross-Source Activity

Goal: connect communication context with engineering context.

Scope:

- SeaTalk source adapter.
- Message, mention, private chat, group discussion, and on-call event normalization.
- Cross-source Activity Session grouping.
- Follow-up extraction.
- Meeting/discussion Knowledge Artifact draft.

Acceptance criteria:

- Orbit can connect a Codex work session with relevant SeaTalk discussion.
- Knowledge Artifact can list decisions, blockers, and follow-ups.
- Sensitive message policy is respected.

## Milestone 4: Electron Desktop Shell

Goal: provide local product surface and user control.

Scope:

- Electron app skeleton.
- Tray/menu bar running state.
- Activity list and detail.
- Knowledge list and detail with edit/review actions.
- Memory list, groups, and search.
- Settings for sources, storage, retention, and AI provider.
- Local service lifecycle.

Acceptance criteria:

- App runs as a local desktop shell.
- User can see what is captured and stored.
- User can review Knowledge and Memory.
- User can pause adapters.

## Milestone 5: Handoff Pack And Agent Continuity

Goal: make Orbit useful to external agents and new agent sessions.

Scope:

- Memory candidate extraction from confirmed Knowledge Artifacts.
- Review queue for Memory candidates.
- Handoff Pack assembly for agent warm-start.
- CLI commands:
  - `orbit status`
  - `orbit activity list`
  - `orbit knowledge search`
  - `orbit memory search`
  - `orbit context today`
  - `orbit context project <name>`
  - `orbit handoff today`
  - `orbit handoff project <name>`
- Desktop Handoff review/copy surface.
- Read-only resource descriptors for later MCP/local API exposure.
- Hardened explicit-path Codex/local-agent ingestion so handoffs can rely on real local source fixtures.

Acceptance criteria:

- External agent can retrieve today's context.
- External agent can search confirmed Memories.
- External agent can retrieve a concise Handoff Pack with current state, recent Activity, confirmed Knowledge, active Memory, Recommendations, safety boundaries, and evidence pointers.
- User can review and copy the Handoff Pack locally before giving it to another agent.
- Memory writes require user confirmation.
- Recommendations include evidence and confidence.
- No handoff output includes raw Event text, secret content, failed-redaction data, draft Knowledge, unconfirmed Memory, or non-exportable sources by default.

MCP server read APIs and Codex/Claude skill wrappers should follow after this milestone, once the CLI/Desktop Handoff Pack shape is stable.

## Milestone 6: Recommendation Engine

Goal: surface useful next actions without taking over.

Scope:

- Follow-up recommendations.
- Blocker recommendations.
- Recurring pattern detection.
- Automation opportunity detection.
- Dismiss, snooze, resolve, accept states.

Acceptance criteria:

- Recommendations explain source evidence.
- User can act on or dismiss recommendations.
- No side-effect actions are executed automatically.

## Later Milestones

- Screen adapter with explicit permission.
- Accessibility-first capture.
- Apple Vision OCR native helper.
- Audio and meeting transcription.
- Calendar, mail, Jira, GitLab adapters.
- Encrypted storage.
- Optional private sync.
- Carefully gated automation and handoff.

## Technical Spikes Before Full Implementation

Run these before committing to final code shape:

1. **SQLite + Markdown sidecar**
   - Verify FTS5, migrations, object deletion, and sidecar consistency.

2. **Electron local service**
   - Verify tray lifecycle, renderer to main IPC, local DB access, and auto-start feasibility.

3. **Adapter cursor model**
   - Verify incremental reads, duplicate detection, and idempotent Event insertion.

4. **AI provider interface**
   - Verify one summarization flow can run with a mock provider and a real provider.

5. **Agent CLI**
   - Verify an external agent can retrieve context through CLI without opening the UI.

6. **Perception Capture Gate**
   - Verify permission copy, visible running state, pause/stop controls, retention defaults, app/window exclusions, audit logging, local processing, redaction before persistence, default agent export blocking, CPU/storage budget, and explicit user approval before raw screen or audio capture.
