# Handoff Pack

## Purpose

Handoff Pack is Orbit's first-class agent warm-start artifact.

Its job is to answer: what should the next agent know before helping? It is not a raw export, transcript dump, or replacement for Knowledge and Memory. It is a bounded, source-backed context package assembled from Activity Sessions, confirmed Knowledge, active Memories, Recommendations, and explicit safety boundaries.

This should become one of Orbit's most important product outputs because it turns long-running local context into immediate continuity for Codex, Claude Code, or another authorized assistant.

## Product Promise

A user should be able to start a new agent session and ask Orbit for a handoff. The agent should receive enough context to continue the work without asking the user to re-explain the project, recent decisions, current state, and next steps.

The handoff should be:

- **Concise**: optimized for agent context injection, not archival reading.
- **Traceable**: every important claim links back to Event, Activity, Knowledge, Memory, or Recommendation evidence.
- **Reviewable**: the user can inspect the generated handoff before giving it to an agent.
- **Privacy-safe by default**: raw private payloads, draft Knowledge, and unconfirmed Memory are excluded unless explicitly requested.
- **Action-aware but side-effect-free**: it can recommend next actions, but it must not execute them.

## Handoff Pack Shape

Each pack should include:

- **Objective**: the current goal, project, or time window the handoff is for.
- **Current State**: what Orbit believes is true now.
- **Recent Activity**: relevant Activity Sessions with summaries, timestamps, sources, and sensitivity.
- **Confirmed Knowledge**: reviewed artifacts that explain decisions, project context, debugging notes, or meeting outcomes.
- **Active Memories**: confirmed long-lived facts, preferences, decisions, and recurring patterns.
- **Decisions**: stable choices the next agent should preserve.
- **Blockers And Risks**: open issues, missing permissions, failed checks, privacy warnings, or context gaps.
- **Recommended Next Actions**: evidence-backed suggestions, ordered by usefulness.
- **Safety Boundaries**: actions that need user confirmation, sources that must not be read, and content that must not be sent externally.
- **Evidence Index**: compact source pointers for every important claim.

## Surfaces

Initial surfaces should be read-only:

```bash
orbit handoff today --json
orbit handoff today --format markdown
orbit handoff today --date <YYYY-MM-DD>
orbit handoff project <name> --json
orbit handoff project <name> --format markdown
```

Current desktop surface:

- Desktop Handoff page generates today or project packs.
- The page previews Markdown locally and can copy it to the clipboard.
- Safety boundaries and evidence pointers are visible in the page.
- The desktop action does not send the handoff to an external agent or service.

Later surfaces:

- MCP resource such as `orbit://handoff/today` and `orbit://handoff/project/<name>`.
- Codex/Claude skill wrapper that asks Orbit for a pack before answering continuity-heavy requests.

## Default Inclusion Rules

Default handoffs should include:

- Activity Session summaries.
- confirmed Knowledge summaries and source pointers.
- confirmed active Memories.
- evidence-backed Recommendations with non-terminal status.
- source, sensitivity, and retention metadata.

Default handoffs should exclude:

- raw Event text when source policy disallows raw export.
- draft Knowledge.
- unconfirmed Memory candidates.
- secret content.
- events with failed redaction.
- sources whose permission scope disallows agent export.
- raw screenshots, recordings, audio, transcripts, and failed-redaction perception data.

Optional flags can widen scope for local review, but the output must mark expanded content clearly:

```bash
orbit handoff today --include-drafts
orbit handoff project orbit --include-memory-candidates
```

Expanded output is still local and review-first. It should not be treated as safe for automatic external transmission.

## Relationship To Existing Objects

Handoff Pack is a derived view, not a new source of truth.

- Activity answers what happened.
- Knowledge answers what was learned.
- Memory answers what should persist.
- Recommendation answers what needs attention.
- Handoff Pack assembles the minimum useful subset for the next agent.

The pack may be stored as a Knowledge Artifact only when the user explicitly saves it. Otherwise it can be generated on demand.

## Non-Goals

- Do not make handoff generation an autonomous execution workflow.
- Do not send the handoff to another app or service without user approval.
- Do not include raw screenshots, recordings, transcripts, or private messages by default.
- Do not let handoff become a generic full export format.
- Do not require screen capture or audio capture before the feature is useful.

## Acceptance Criteria

The first implementation is useful when:

- A fresh agent can run a CLI command and receive a concise source-backed Markdown or JSON handoff.
- The pack includes current objective/state, recent activity, confirmed knowledge, confirmed memory, recommendations, safety boundaries, and evidence pointers.
- The default output is safe for local agent context injection under source permission policies.
- Draft and unconfirmed objects are omitted by default.
- The desktop app can generate or copy a handoff without performing external side effects.
