# Alpha Perception And Context Completion

Last updated: 2026-05-21

## Purpose

Goal 8 turns the perception readiness work from Goal 7 into an Alpha implementation goal.

Orbit Alpha should be able to fill the daily-context gaps that app/window metadata and imported
agent sessions miss: browser research, UI debugging, design review, meetings, screen-visible work,
and work that never becomes a command, chat message, or file change.

This is capability-complete Alpha work, not a passive surveillance shortcut. The product target is:

```text
Perception Source Adapter
  -> Event
  -> Activity Session
  -> Knowledge Artifact
  -> Memory Candidate
  -> Recommendation
  -> Handoff Pack
```

Screen, OCR, vision, and audio are real Goal 8 inputs. They are not enabled by default, not exported
raw by default, and not stored as indefinite raw media archives.

## Product Stance

Alpha should expose the full perception capability surface behind explicit controls:

- Screen/window capture for a user-selected scope.
- OCR over explicit screen/window frames.
- Vision model summarization for bounded, redacted visual observations.
- Meeting/session audio capture and transcription.
- Per-source AI provider policy for OCR post-processing, vision summaries, and transcription.
- Visible start, pause, resume, stop, delete, and protected-app controls.
- Audit logs for collection, processing, redaction, retention, deletion, and export decisions.

"Capability-complete" means the user can intentionally turn the capability on and verify that it
feeds Activity, Knowledge, Memory candidate, Recommendation, Today, and Handoff flows. It does not
mean silent capture, default raw recording, keystroke logging, or unbounded local scanning.

## Non-Goals

- Silent screen recording.
- Continuous raw screenshot archive.
- Default OCR.
- Default microphone or system audio capture.
- Ambient always-on microphone mode.
- Keystroke capture.
- Password-field capture.
- Silent browser scraping.
- Arbitrary filesystem scanning.
- Raw media export in default Handoff Packs.
- Sending perception data to external AI providers by default.
- Side-effect automation based on perceived context.

## Goal 8 Checkpoints

Each checkpoint is independently implemented, verified, committed, and pushed. If a checkpoint finds
a technical blocker, stop at that checkpoint, document the blocker, and do not absorb later scope.

### Goal 8A: Perception Source Control And Policy Surface

Deliver the control plane before live high-risk capture.

Required scope:

- Add source settings for screen, OCR, vision, microphone audio, system audio, and transcript data.
- Add per-source runtime states: `not_configured`, `needs_permission`, `ready`, `collecting`,
  `paused`, `warning`, `error`, and `disabled`.
- Add per-source policies for raw storage, summary storage, AI use, agent export, TTL, sensitivity,
  protected apps, and deletion.
- Add provider routing for `ocr`, `vision`, and `transcription` tasks with `disabled`, `mock`,
  local, and OpenAI-compatible provider slots.
- Keep every high-risk source disabled until the user explicitly enables it.
- Add audit events for enable, disable, pause, resume, policy change, permission check, and delete.

Acceptance:

- Desktop Settings and Sources show the high-risk perception sources as configurable, disabled by
  default, and independently controllable.
- CLI can report perception capability and policy state without starting capture.
- No screen, OCR, vision, audio, or transcript capture runs in this checkpoint.

### Goal 8B: Screen/Window Capture And OCR Event Pipeline

Deliver sparse, explicit screen/window observation with OCR.

Required scope:

- Add a mockable native-helper boundary for ScreenCaptureKit or an equivalent macOS capture path.
- Require Screen Recording permission before any frame capture.
- Let the user choose display, app, window, or region scope before capture starts.
- Enforce protected apps and excluded windows before capture and before OCR.
- Capture sparse frames under CPU/storage budgets, not continuous video by default.
- Run OCR locally where available, with Chinese and English supported.
- Convert results into `screen_observation` and `ocr_text` Events with source pointers, hashes,
  redaction state, sensitivity, retention policy, and bounded summaries.
- Keep raw screenshots off by default; if enabled, require a short TTL and audit entry.

Acceptance:

- Fixture and mock capture tests prove protected apps suppress frames and OCR.
- A local smoke test can start, pause, resume, and stop an explicit screen/window observation.
- Activity Sessions can include screen/OCR Events without raw media in default storage.

### Goal 8C: Vision Model Summarization

Deliver model-assisted visual context without making raw frames the product center.

Required scope:

- Add a vision summarization task to the AI provider abstraction.
- Support mock provider first, then configured local or OpenAI-compatible providers.
- Require explicit per-source permission before any screen-derived image is sent to a model.
- Redact, downsample, crop, or summarize locally before external model calls when possible.
- Apply prompt templates that extract work context, visible task state, UI errors, decisions, and
  follow-ups without creating a screenshot transcript.
- Persist bounded `screen_observation` summaries and evidence pointers, not raw model inputs.
- Record provider, model, policy, token/image budget, redaction result, and export eligibility.

Acceptance:

- Mock vision provider tests prove deterministic summaries flow into Events and Knowledge drafts.
- External provider paths are disabled until configured and source policy allows AI use.
- Failed redaction blocks model calls and excludes the Event from Handoff.

### Goal 8D: Audio/Meeting Capture And Transcription

Deliver explicit meeting/session audio observation.

Required scope:

- Add a meeting/session mode for microphone and, where supported, selected system audio capture.
- Require microphone/system-audio permission before capture.
- Show visible active state and current audio scope while collecting.
- Support pause, resume, stop, and immediate buffer flush.
- Add VAD/chunking or equivalent segmentation so audio is processed in bounded segments.
- Prefer local transcription for Alpha; allow configured provider use only with explicit source
  policy.
- Convert output into `audio_segment` and `transcript_segment` Events with redacted summaries,
  transcript confidence, source pointers, retention policy, and audit records.
- Keep raw audio off by default; optional raw audio TTL must be session-scoped and short.

Acceptance:

- Fixture/mock audio tests produce redacted transcript Events.
- Protected apps, paused state, and redaction failure prevent transcript persistence.
- Meeting/session transcripts can contribute to Activity and Knowledge drafts.

### Goal 8E: Daily Context Completion UX

Make perception evidence useful in the actual product loops.

Required scope:

- Show perception-derived Activity Sessions with source kind, sensitivity, policy, and evidence.
- Generate Knowledge drafts from mixed app/window, screen/OCR, vision, and transcript evidence.
- Generate Memory candidates only from confirmed Knowledge.
- Add Recommendations for missed follow-ups, unresolved visible errors, meeting action items, and
  context gaps, with evidence and confidence.
- Update Today and Handoff so redacted, export-allowed perception summaries can be included while raw
  screenshots, raw audio, raw transcripts, failed-redaction Events, and non-exportable sources remain
  excluded by default.

Acceptance:

- A clean fixture run can demonstrate a day with app/window metadata plus screen/OCR/vision/audio
  evidence producing Activity, Knowledge drafts, Recommendations, Today context, and Handoff output.
- Default Handoff contains summaries and source pointers only.
- User review states are preserved when perception Events are re-indexed.

### Goal 8F: Alpha Hardening And Release Gate

Make the perception stack fit for Alpha users.

Required scope:

- Add CPU, battery, storage, queue, and provider-budget limits.
- Add deletion, cleanup, and TTL enforcement for perception sidecars.
- Add audit-log review for capture start/stop, redaction failure, model call, transcription, deletion,
  and Handoff inclusion/exclusion.
- Package/sign any native helper required for macOS Alpha distribution.
- Add manual macOS permission smoke tests for Screen Recording, Microphone, protected apps, pause,
  stop, delete, and no-default-capture behavior.
- Document known limitations and blocked sources.

Acceptance:

- Packaged Alpha can run perception controls without private fixture data.
- Performance budgets are measured and documented.
- Privacy cleanup removes raw sidecars and preserves source-backed summaries where policy allows.

## Data And Event Requirements

Goal 8 must preserve the existing stable object model.

Required source kinds:

- `screen`
- `ocr`
- `audio`
- `transcript`
- existing desktop/accessibility/browser/terminal/filesystem/clipboard kinds

Required event types:

- `screen_observation`
- `ocr_text`
- `audio_segment`
- `transcript_segment`
- existing observation state and permission state events

Every perception Event must include:

- source pointer,
- timestamp,
- app/window/scope metadata when available,
- sensitivity,
- retention policy,
- redaction state,
- raw sidecar policy,
- AI-use policy,
- agent-export policy,
- evidence hash.

Raw sidecars are optional and policy-bound. Activity, Knowledge, Memory, Recommendation, Today, and
Handoff must remain useful when raw sidecars expire.

## Provider Policy

AI provider integration is part of Goal 8 because screen/OCR/vision/audio context needs model help to
be useful.

Provider requirements:

- Separate provider task routing for summarization, embedding, OCR post-processing, vision, and
  transcription.
- `disabled` and `mock` providers remain valid choices for tests and privacy-sensitive users.
- Local providers are preferred for OCR, vision, and transcription when available.
- External providers require explicit user configuration and source policy allowing AI use.
- Raw screenshots, raw audio, and raw transcripts are not sent externally by default.
- Failed-redaction content must not be sent to any provider.
- Provider calls must write audit metadata without storing secret credentials or raw prompts in audit
  logs.

## Goal 8 Acceptance Commands

Goal 8 implementation should add any missing CLI commands needed by these checks.

Use a clean local Orbit home for acceptance:

```bash
rm -rf .tmp/goal-8-acceptance
export ORBIT_HOME="$PWD/.tmp/goal-8-acceptance"
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/core test
pnpm --filter @orbit/privacy test
pnpm --filter @orbit/adapters test
pnpm --filter @orbit/desktop test
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
pnpm --filter @orbit/cli orbit observe status --json
pnpm --filter @orbit/cli orbit perception status --json
pnpm --filter @orbit/cli orbit perception cleanup --dry-run --json
pnpm --filter @orbit/cli orbit perception release-gate --json
pnpm --filter @orbit/cli orbit context today --json
pnpm --filter @orbit/cli orbit handoff today --json
```

Recommended fixture acceptance after implementation:

```bash
pnpm --filter @orbit/cli orbit ingest fixtures --json
pnpm --filter @orbit/cli orbit ingest perception-fixtures --json
pnpm --filter @orbit/cli orbit pipeline run --json
pnpm --filter @orbit/cli orbit activity list --json
pnpm --filter @orbit/cli orbit knowledge list --json
pnpm --filter @orbit/cli orbit recommendation list --json
pnpm --filter @orbit/cli orbit handoff today --json
```

## Completion Criteria

Goal 8 is complete only when:

- Screen/OCR, vision, and audio/transcript sources are implemented as opt-in Source Adapters.
- The user can see and control capture state from Desktop.
- Capture is paused/stopped/deleted reliably.
- Protected apps suppress high-risk capture.
- Redaction runs before persistence, AI use, indexing, and export.
- Raw media is off by default and, if enabled, short-lived.
- Perception evidence feeds Activity, Knowledge, Memory candidates, Recommendations, Today, and
  Handoff.
- Default Handoff excludes unsafe raw perception payloads.
- Tests and macOS smoke checks verify no-default-capture behavior.

## Post-Goal 8 Follow-Up

Goal 8 makes the perception surface explicit, safe, and fixture/smoke verifiable. It does not by
itself guarantee a fully model-backed daily loop.

Use [LLM Perception And Context Automation](./llm-perception-and-context-automation-plan.md) for the
next implementation goal that closes the remaining Alpha gaps:

- runtime-effective provider routing for every AI task,
- real transcription providers,
- image-capable vision/OCR provider paths,
- live opt-in desktop perception runtime,
- LLM-assisted Memory and Recommendation candidates,
- visible daily automation that refreshes Today and Handoff.
