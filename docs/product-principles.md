# Product Principles

## Positioning

Orbit is a local-first work context continuity system. It quietly observes authorized work signals, turns fragmented activity into traceable knowledge, and helps the user recover context, review progress, and notice follow-ups.

Orbit should not be positioned as a screenshot search product, a generic notes app, or a backup archive. Raw data is only evidence. The product value is the structured continuity it creates from that evidence.

## Core Problem

The user loses context across time, tools, and projects:

- What was I doing before I switched tasks?
- Why did we make this decision?
- What did I promise to follow up?
- Have I solved this issue before?
- What should the next agent know before helping me?

Orbit's job is to reduce re-explanation. The user and their AI tools should not repeatedly reconstruct the same work context from chat logs, terminal history, screenshots, and memory.

## First Principles

- **Context continuity is the scarce resource**: The product should optimize for remembering why work happened, not only what appeared on screen.
- **Raw data is cost, structured knowledge is value**: Events, messages, recordings, and commands are evidence. Knowledge Artifacts and Memories are the durable product output.
- **Trust requires traceability**: Important summaries, memories, and recommendations must link back to source Activity Sessions or Events.
- **Adapters are replaceable**: Codex, SeaTalk, screen capture, calendar, mail, Jira, and GitLab are input channels. The stable core is the Event schema and processing pipeline.
- **Perception is an input, not the center**: Screen and audio can become first-class future adapters because they help Orbit understand browser, UI, meeting, and design work. They must remain permissioned, high-risk evidence sources rather than the main product surface.
- **Proactivity must be explainable**: Recommendations need basis, confidence, and suggested action. Orbit should not perform side effects without approval.
- **Automation comes after reliability**: Orbit should first become a trustworthy context system, then gradually support task execution and handoff.

## Product Layers

Orbit should expose four product surfaces:

1. **Activity**
   - Timeline of Activity Sessions.
   - Restores the factual work scene.
   - Shows source apps, timestamps, events, local storage status, and evidence links.

2. **Knowledge**
   - Reviewable artifacts generated from one or more Activity Sessions.
   - Examples: daily brief, meeting summary, debugging note, project recap, decision record.
   - User can edit, copy, translate, confirm, or reject.

3. **Memory**
   - Long-lived, compact, reusable facts and patterns.
   - Examples: user preferences, project facts, stable decisions, common pitfalls, recurring workflows.
   - Memory should be smaller and more durable than Knowledge Artifacts.

4. **Recommendations**
   - Suggestions derived from Activity, Knowledge, and Memory.
   - Examples: "follow up with X", "this task is blocked by Y", "you have repeated this manual check three times".
   - Each recommendation must explain why it exists.

Orbit should also treat **Handoff Pack** as a first-class product output.

- A Handoff Pack is a concise, traceable, privacy-safe context package for the next agent.
- It assembles current objective, recent Activity, confirmed Knowledge, active Memories, Recommendations, safety boundaries, and evidence pointers.
- It answers "what should the next agent know before helping me?" without dumping raw logs or unreviewed private data.
- It should be available through CLI first, then MCP/local API, skill wrappers, and desktop review/copy actions.
- Handoff generation is read-only by default; it can suggest next actions but must not execute them.

See [Handoff Pack](./handoff-pack.md) for the product shape and default inclusion rules.

Screen and audio perception should support Handoff Pack later by contributing redacted, traceable Events. Handoff Pack must not depend on perception capture and must block raw screenshots, recordings, audio, transcripts, failed-redaction data, and non-exportable sources by default. See [Perception Research Spike](./perception-research-spike.md).

## Non-Goals For The First Development Cycle

- Do not build full screen recording as the first core feature.
- Do not build autonomous execution or message sending.
- Do not treat every generated summary as long-term memory.
- Do not bind the architecture to Codex or SeaTalk.
- Do not store raw data indefinitely by default.
- Do not optimize for cloud sync before local trust and review flows work.

## Success Criteria

Early Orbit is useful if it can:

- Ingest Codex and SeaTalk context into a common Event model.
- Group Events into meaningful Activity Sessions.
- Generate traceable Knowledge Artifacts for a workday or task.
- Let the user confirm a small set of durable Memories.
- Answer "what happened today" and "what needs attention" using source-backed evidence.
- Generate a Handoff Pack through CLI or MCP so an external agent can continue the work without the user re-explaining context.
