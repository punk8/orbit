# Orbit Product Direction: Handoff And Perception

## Purpose

This spec pins down the product direction before Goal 6 implementation starts. Orbit should become a local-first work context continuity system whose first must-have output is a privacy-safe agent handoff. Screen and audio should be treated as first-class perception inputs, but not as the product's main surface or promise.

## Product Promise

Orbit should help the user avoid re-explaining work context across days, tools, and agent sessions.

The early finished product should reliably answer:

- What was I doing?
- What changed recently?
- What decisions and constraints should still be respected?
- What needs attention next?
- What should the next agent know before helping me?

## Product Center

The center of the product is structured work continuity:

```text
Source Adapter -> Event -> Activity Session -> Knowledge Artifact -> Memory -> Recommendation -> Handoff Pack
```

The first killer feature should be Handoff Pack plus today's context. Handoff Pack is the agent warm-start output that assembles recent Activity, confirmed Knowledge, active Memory, Recommendations, safety boundaries, and evidence pointers without dumping raw logs.

## Perception Positioning

Screen and audio are necessary long-term inputs because many real work signals do not appear in Codex, chat, Git, or documents. They are how Orbit can understand browser research, UI debugging, design work, meetings, window switching, and non-text workflows.

They should be positioned as:

- first-class Source Adapters,
- high-risk perception inputs,
- evidence sources for Activity Sessions,
- optional inputs with visible running state,
- short-retention raw data sources by default.

They should not be positioned as:

- the primary product surface,
- a screenshot search product,
- a raw recording archive,
- a default agent export source,
- a prerequisite for Handoff Pack.

## Product Surface Order

1. **Source and privacy foundation**
   - Users can see, reconfigure, pause, disable, delete, and audit configured sources.
   - Old data can be privacy-cleaned before adding more sensitive inputs.

2. **Handoff Pack**
   - CLI first: `orbit handoff today` and project handoff commands.
   - Desktop review/copy after the CLI shape is stable.
   - Default output includes confirmed and policy-allowed context only.

3. **Knowledge and Memory review UX**
   - Users can inspect evidence, edit generated artifacts, confirm durable memories, and copy Markdown.

4. **Perception research spike**
   - Validate macOS Accessibility, ScreenCaptureKit, Apple Vision OCR, audio capture/transcription, permission UX, storage cost, CPU cost, and exclusion rules.
   - Produce a narrow implementation proposal before recording raw screen/audio data.

5. **Perception adapter implementation**
   - Start with active app/window metadata and Accessibility text.
   - Add OCR only when Accessibility text is insufficient.
   - Add audio transcription for explicit meeting/session mode before any always-on microphone mode.

## Privacy Rules

Handoff Pack and agent-facing context must not include raw screen, audio, private messages, secrets, failed-redaction events, draft Knowledge, or unconfirmed Memory by default.

Perception inputs require stronger user controls:

- explicit enablement,
- visible active state,
- pause and stop,
- app/window exclusions,
- raw screenshot/audio TTL,
- local-only processing by default,
- source-level export and AI permissions,
- audit logs for capture, processing, cleanup, and export.

## Goal 6 Gate

Goal 6 should run before Handoff Pack implementation and before any screen/audio adapter work.

Goal 6 must make the source layer safe enough for future sensitive inputs:

- old sources can be reconfigured,
- exact source path/interface is visible,
- sources can be disabled or deleted with audit,
- cursors can be reset and re-ingested idempotently,
- old raw event text can be cleaned according to source policy,
- cleanup does not break Activity, Knowledge, Memory, Recommendation, or evidence pointers,
- agent context remains raw-private-data-safe by default.

## Non-Goals

- Do not implement screen recording in Goal 6.
- Do not implement audio capture in Goal 6.
- Do not implement MCP in Goal 6.
- Do not send Handoff Pack externally in Goal 6.
- Do not add side-effect automation.
- Do not silently scan private local paths.

## Acceptance

This direction is accepted when future planning and implementation use these defaults:

- Handoff Pack is treated as the first agent-facing product output.
- Screen/audio are treated as first-class future adapters and high-risk perception sources.
- Source governance and privacy cleanup are completed before adding broader perception inputs.
- User-facing new text remains i18n-ready and supports Chinese as a first-class language.
