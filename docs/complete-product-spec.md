# Complete Product Spec

## Purpose

This document defines what "complete Orbit" means beyond the current Alpha implementation.
It turns the product principles into executable product requirements so future work does
not drift into a narrow screenshot search tool, a generic notes app, or a Codex-only helper.

The complete product remains centered on:

```text
Source Adapter -> Event -> Activity Session -> Knowledge Artifact -> Memory -> Recommendation -> Handoff
```

Alpha proves this path with explicit local sources. The complete product makes the path reliable,
multi-source, privacy-governed, searchable, explainable, and useful to external agents.

## Product Promise

Orbit is a local-first work context continuity system. It observes explicitly authorized work
signals, turns fragmented activity into traceable knowledge, lets the user govern durable memory,
and produces concise context for daily review, project recall, proactive attention, and agent
handoff.

Complete Orbit must let a user answer these questions without reconstructing context manually:

- What did I do today, and what evidence supports that summary?
- What decisions were made, why, and where did they come from?
- What follow-ups, blockers, risks, or repeated patterns need attention?
- What stable facts should future agents remember?
- What should the next agent know before helping with this project?
- What did Orbit read, save, summarize, redact, export, or exclude?

## Product Surfaces

### Today

Today is the daily command center.

Required capabilities:

- Show collection and processing status.
- Show the day's Activity Sessions, generated Knowledge, Memory candidates, confirmed Memory
  touched today, and active Recommendations.
- Produce a concise daily summary with completed work, decisions, code changes, discussions,
  blockers, and follow-ups.
- Let the user copy a standup-ready or daily-brief-ready summary.
- Link every important summary item back to Activity Session or Event evidence.
- Warn when important sources are disabled, paused, failing, or excluded from agent export.

Success criteria:

- A user can understand the day in under 30 seconds.
- Clicking a claim opens supporting evidence.
- The page never presents unreviewed Memory as confirmed fact.

### Activity

Activity is the evidence layer, not a memory layer.

Required capabilities:

- List Activity Sessions by date, project, app, source, sensitivity, and status.
- Show session time window, duration, apps, source kinds, event count, sensitivity, storage state,
  raw availability, and evidence references.
- Show linked Knowledge, Memory, and Recommendations derived from the session.
- Rebuild sessions from Events idempotently when grouping logic changes.
- Mark when evidence is unavailable because raw data expired, was deleted, or was blocked by
  privacy policy.

Success criteria:

- A user can verify what happened and where a derived claim came from.
- Session rebuilds do not duplicate derived objects or erase review state.

### Knowledge

Knowledge is the reviewable document layer.

Required capabilities:

- Generate drafts for daily brief, weekly review, meeting summary, debugging note, decision
  record, project context, follow-up list, and custom artifact types.
- Show metadata, source sessions, description, key insights, decisions, blockers, follow-ups,
  provider metadata, confidence, and evidence.
- Support edit, copy Markdown, confirm, reject, archive, search, export, and translate.
- Prevent rejected Knowledge from generating new Memory.
- Hide archived Knowledge from default agent context while keeping it searchable and auditable.

Success criteria:

- A Knowledge Artifact is useful as a human-readable work note.
- Every important claim is traceable to evidence.
- The user can correct generated text before it affects Memory or Handoff.

### Memory

Memory is the durable recall layer.

Required capabilities:

- Generate compact candidates only from confirmed Knowledge or explicit user action.
- Support project facts, user preferences, decisions, workflow patterns, common issues,
  relationship context, and domain knowledge.
- Support status, scope, tags, confidence, evidence, valid dates, review dates, supersession,
  archive, rejection, deletion, and search.
- Include only confirmed active Memory in default agent context.
- Preserve version history for edits and show when Memory evidence is deleted or unavailable.

Success criteria:

- Memory remains smaller and more stable than Knowledge.
- Memory search returns reusable facts, not raw logs.
- No candidate becomes durable context without user confirmation or a documented trusted policy.

### Recommendations

Recommendations are explainable suggestions, not autonomous actions.

Required capabilities:

- Generate follow-up, blocker, risk, context-needed, recurring-pattern, and automation-opportunity
  recommendations.
- Include title, explanation, suggested action, confidence, impact, status, due/snooze metadata,
  and evidence.
- Support accept, dismiss, snooze, resolve, and evidence expansion.
- Rank by impact, freshness, confidence, user preference, and unresolved state.
- Clearly label side-effect level:
  - Level 0: read-only insight.
  - Level 1: Orbit-local draft suggestion.
  - Level 2: Knowledge or Memory write that requires confirmation.
  - Level 3: external side effect, blocked until explicit future design.

Success criteria:

- A recommendation without evidence is not shown.
- Accepting a recommendation records intent only unless a future, explicit permission flow exists.

### Handoff

Handoff is the agent warm-start product output.

Required capabilities:

- Generate today and project packs in Markdown and JSON.
- Include objective, current state, recent Activity, confirmed Knowledge, active Memory, decisions,
  blockers/risks, recommended next actions, safety boundaries, and evidence index.
- Exclude draft Knowledge, unconfirmed Memory, secret content, failed-redaction data, raw private
  payloads, raw screenshots, recordings, audio, transcripts, and non-exportable sources by default.
- Let the user preview and copy the pack before sharing it with an agent.
- Support later MCP and local API resources over the same read-only object shape.

Success criteria:

- A new agent can continue the work without asking the user to re-explain recent context.
- The handoff is concise enough for context injection and traceable enough for audit.

### Sources

Sources are explicit, replaceable adapters.

Required capabilities:

- Add, disable, pause, resume, reconfigure, reset cursor, run ingestion, view warnings, and view
  permission scope for each source.
- Show what path, API, import file, or permission boundary a source reads.
- Show last sync time, last event time, event counts, warnings, errors, sensitivity defaults,
  retention policy, AI eligibility, raw storage eligibility, and agent export eligibility.
- Support synthetic fixtures for demo/testing without implying a default production source.

Success criteria:

- Orbit never silently scans private local paths.
- The user can see what each source can read and what it is allowed to store/export.

### Settings And Local Data Operations

Required capabilities:

- Configure language, menu bar residency, launch at login, database location, source setup,
  collection pause, AI provider, indexing, retention, export, audit/debug bundle, re-index, privacy
  cleanup, and clear local data.
- Keep destructive operations behind confirmation.
- Show local-only state, vector/FTS status, provider task boundaries, and raw data policy.
- Support Chinese and English UI, date/time localization, and future project/user language
  preferences.

Success criteria:

- A user can operate Orbit safely without developer tools.
- Data operations are auditable and reversible where possible.

## End-To-End User Scenarios

### Daily Review

Trigger:

- User opens Orbit at the end of the day or runs `orbit context today`.

Flow:

1. Orbit ingests enabled sources.
2. Events are deduplicated and privacy policy is applied.
3. Activity Sessions are rebuilt.
4. Knowledge drafts are generated or refreshed.
5. Recommendations are generated.
6. Today shows summary, open review items, and attention list.

Done when:

- The user can copy a daily summary.
- Every summary item links to evidence.
- Unconfirmed Memory is clearly separated from confirmed context.

### Project Recall

Trigger:

- User searches for a project or runs `orbit context project <name>`.

Flow:

1. Orbit retrieves Activity, Knowledge, Memory, and Recommendations scoped to the project.
2. Results are grouped by decisions, current state, known issues, open follow-ups, and evidence.
3. Confirmed Memory is prioritized over draft Knowledge.

Done when:

- The user can recover project context across multiple days and sources.
- Stale or superseded Memory is visible as such.

### Debugging Or Incident Recap

Trigger:

- Commands, test failures, code-change events, chat discussion, and follow-ups cluster around an
  issue.

Flow:

1. Activity grouping connects source events by repository, thread, app, and time.
2. Knowledge draft captures symptoms, attempted fixes, root cause, decision, verification, and
   follow-ups.
3. Memory candidates capture only reusable lessons.
4. Recommendations highlight unresolved blockers or missing verification.

Done when:

- The recap can be reused later without reading raw logs.
- Evidence remains available for audit.

### Meeting Or Discussion Summary

Trigger:

- Calendar, chat, docs, imported transcript, or approved meeting notes produce Events.

Flow:

1. Events are grouped by meeting/thread/time.
2. Knowledge draft captures attendees, agenda, decisions, action items, risks, and open questions.
3. Follow-up Recommendations are generated from open items.
4. Memory candidates are limited to durable decisions or project facts.

Done when:

- Action items are evidence-backed.
- Private or confidential content follows source policy before AI or export.

### Agent Handoff

Trigger:

- User starts a new agent session or asks for a project handoff.

Flow:

1. Orbit assembles a Handoff Pack from safe Activity, confirmed Knowledge, confirmed Memory, and
   active Recommendations.
2. Unsafe or unreviewed objects are excluded with reasons.
3. User previews/copies the pack.

Done when:

- The next agent receives enough context to continue work.
- The pack does not leak raw private payloads by default.

## Object Lifecycle Requirements

### Event

- Events are append-oriented normalized facts.
- Event IDs must be deterministic for the same source pointer and normalized content.
- Events retain source pointer, timestamp, app/project/thread hints, privacy metadata, and hash.
- Raw text is optional and controlled by source policy.
- Secret or failed-redaction raw content must not be persisted.

### Activity Session

- Sessions are derived and reproducible from Events.
- Sessions preserve event IDs and evidence.
- Sessions can be rebuilt without losing reviewed Knowledge or Memory.
- Session grouping changes must be auditable when they affect existing links.

### Knowledge Artifact

- Generated Knowledge starts as draft or needs review.
- Confirmed Knowledge may be used for context and Memory candidate extraction.
- Rejected Knowledge must not produce new Memory candidates.
- Archived Knowledge remains searchable/auditable but excluded from default context.

### Memory

- Memory starts as needs review unless explicitly created and confirmed by the user.
- Confirmed active Memory is the only Memory included in default agent context.
- Memory edits must preserve version/audit history.
- Superseded Memory should remain traceable but not compete with current Memory.

### Recommendation

- Recommendations must include evidence and confidence.
- Terminal states are dismissed and resolved.
- Snoozed recommendations should not appear in attention lists until due.
- Accepted recommendations do not execute external side effects in Alpha or the complete read-first
  product baseline.

## Complete Source Coverage

The complete product should support these source families through the same adapter contract.

| Source | Production state required | Default sensitivity | Raw storage default | AI default | Agent export default |
| --- | --- | --- | --- | --- | --- |
| Fixtures | Demo/test only | internal/confidential | off | allowed for synthetic only | allowed |
| Codex/local agent | Explicit local path | internal | off | allowed if not confidential/secret | allowed |
| Approved chat import | Explicit import file/folder | confidential | off | blocked unless user allows | blocked unless user allows |
| Calendar | OAuth or local export | internal | off | allowed for metadata/summaries | allowed for non-private calendars |
| Mail | OAuth or approved export | confidential | off | blocked by default | blocked by default |
| Docs/notes | Explicit folder/OAuth scope | internal/confidential | off | policy-based | policy-based |
| Jira/task system | OAuth/API token scope | internal | off | allowed for issue summaries | allowed |
| GitHub/GitLab/repository | Explicit repo/API scope | internal | off | allowed for summaries | allowed |
| Filesystem | Explicit folder allowlist | internal/confidential | off | policy-based | policy-based |
| Screen/accessibility | Explicit OS permission | confidential | short TTL only | blocked by default | blocked by default |
| Audio/meeting | Explicit OS/app permission | confidential | short TTL only | blocked by default | blocked by default |

Detailed adapter requirements are defined in [Source Adapter Complete Contract](./source-adapter-complete-contract.md).

## Semantic Quality Requirements

Complete Orbit needs deterministic fallbacks plus measurable AI quality.

Required semantic tasks:

- Event classification.
- Activity grouping.
- Activity summarization.
- Knowledge drafting.
- Memory candidate extraction.
- Recommendation generation and ranking.
- Handoff selection and compression.
- Redaction and sensitivity classification.
- Embedding/search ranking when vector search is enabled.

Each task must define:

- Inputs and forbidden inputs.
- Output schema.
- Evidence requirement.
- Confidence meaning.
- Failure fallback.
- Golden fixture examples.
- Regression metrics.

Detailed quality and evaluation requirements are defined in
[Semantic Quality And Evaluation](./semantic-quality-evaluation.md).

## Privacy And Security Requirements

Complete Orbit must ship with local-first controls that users can inspect.

Required controls:

- Explicit source setup.
- Pause/resume collection.
- Source disable and deletion.
- Cursor reset.
- Retention settings.
- Raw storage policy.
- Redaction before persistence or AI use when feasible.
- AI provider permission gate.
- Agent export permission gate.
- Audit logs for source, review, AI, export, settings, and data operations.
- Clear local data with confirmation.
- Export summary-only context by default.

Detailed release and security gates are defined in
[Release Readiness Spec](./release-readiness-spec.md).

## AI Provider Requirements

Complete Orbit must support a hybrid provider model.

Provider tasks should be task-oriented, not a single global model switch:

- `draftKnowledgeArtifact`
- `summarizeActivity`
- `extractMemoryCandidates`
- `classifyEvent`
- `rankRecommendations`
- `embedText`
- `redactSensitiveText`
- `transcribeAudio`
- `extractScreenText`

Provider requirements:

- Deterministic fallback remains available.
- External provider use requires explicit configuration.
- Source permission and sensitivity must be checked before payload assembly.
- Payloads must be minimized.
- Provider metadata must be stored on generated objects.
- AI usage must write audit logs.
- Connection tests must use synthetic prompts only.
- API keys must not be stored in SQLite plaintext.

## Agent Interface Requirements

The complete product should expose a read-first interface through CLI, local API, and MCP.

Required read operations:

- Get status.
- Search Activity Sessions.
- Retrieve Knowledge Artifacts.
- Search confirmed Memories.
- Get today context.
- Get project context.
- Get Recommendation explanations.
- Generate Handoff Packs.

Guarded write operations:

- Draft Knowledge Artifact.
- Propose Memory candidate.
- Save Handoff as Knowledge Artifact.

Blocked until a future automation design:

- Send messages.
- Modify code.
- Create external tasks.
- Commit or push changes.
- Delete source data outside Orbit.

API compatibility requirements:

- Version all response schemas.
- Include evidence IDs and source pointers.
- Exclude raw private payloads by default.
- Return exclusion reasons when objects are omitted.

## Localization Requirements

Chinese is a first-class product language.

Required behavior:

- User-visible UI text goes through i18n.
- CLI user-facing text should have a path to localization.
- Generated Knowledge, Memory, Recommendation, and Handoff language should follow user/project
  preference when configured.
- Date/time formatting must respect locale.
- UI layout must tolerate Chinese and English string length differences.
- Prompt contracts must include target language and avoid hard-coded English-only assumptions.

## Packaging And Operations Requirements

Complete Orbit must move from developer runtime to user-installable runtime.

Required deliverables:

- Development run mode.
- Packaged local app smoke target.
- DMG and ZIP artifacts.
- Signing and notarization before distribution beyond trusted internal users.
- Migration tests for database schema changes.
- Backup/export and restore guidance.
- Crash-safe ingestion and indexing.
- CPU, memory, and storage budget for background collection.
- Clear logs that exclude raw private payloads.

## Release Gates

A release cannot be considered complete until these gates pass:

- Product scenario tests cover daily review, project recall, debugging recap, meeting summary, and
  agent handoff.
- Source adapter tests cover idempotent ingestion, cursor reset, permission scope, malformed input,
  and source deletion.
- Semantic evaluation passes quality thresholds for Activity grouping, Knowledge drafts, Memory
  candidates, Recommendations, and Handoff.
- Privacy tests verify redaction, AI gating, raw storage policy, agent export exclusion, and local
  data clear.
- Electron smoke tests cover first-run source setup, Today, Activity, Knowledge, Memory,
  Recommendations, Handoff, Review Queue, Sources, Settings, re-index, export, and pause/resume.
- Packaging smoke verifies app launch, menu bar behavior, launch-at-login setting, DB path display,
  source setup, and no private-path scan on first launch.

## Non-Goals Until Explicitly Redesigned

- Silent background scanning of private folders.
- Direct SeaTalk scraping without approved read path.
- Full raw screenshot or audio retention as a default feature.
- Cloud sync as a prerequisite for usefulness.
- External side-effect automation.
- Automatically treating every summary as Memory.
- Sending raw private payloads to external AI providers.

## Documentation Completion Checklist

The product documentation is complete enough for implementation when these documents stay aligned:

- [Product Principles](./product-principles.md): why Orbit exists and what it is not.
- [Architecture](./architecture.md): durable system boundaries.
- [Data Model](./data-model.md): object schemas and lifecycle fields.
- [Privacy And Permissions](./privacy-permissions.md): policy model.
- [Complete Product Spec](./complete-product-spec.md): full product behavior and scenario matrix.
- [Source Adapter Complete Contract](./source-adapter-complete-contract.md): adapter interfaces and
  source-specific rules.
- [Semantic Quality And Evaluation](./semantic-quality-evaluation.md): generation quality gates.
- [Release Readiness Spec](./release-readiness-spec.md): packaging, security, operations, and release
  gates.
- [Development Tasks](./development-tasks.md): current implementation checkpoints.

