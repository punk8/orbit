# LLM Perception And Context Automation

Last updated: 2026-05-21

## Purpose

Goal 9 turns the Goal 8 perception control plane and fixture-backed pipelines into a model-backed
Alpha loop.

The product target is:

```text
Visible opt-in observation
  -> bounded screen/OCR/audio/transcript Events
  -> policy-approved LLM processing
  -> Activity Session
  -> Knowledge Artifact
  -> Memory Candidate
  -> Recommendation
  -> Today and Handoff
```

Goal 9 is not a relaxation of Orbit's privacy model. It makes the product more capable while keeping
capture visible, pausable, scoped, protected-app aware, budgeted, redacted, audited, and disabled by
default.

## Current State

Implemented and usable today:

- Text Knowledge drafting can use the OpenAI-compatible provider when configured.
- Desktop Settings can store and test the general AI provider configuration.
- The semantic pipeline filters Events by source policy before `draftKnowledge` provider calls.
- Perception source policies and provider routes exist for OCR, vision, and transcription.
- Mock screen/OCR, mock vision summaries, mock audio/transcript fixtures feed Activity, Knowledge,
  Recommendations, Today, and Handoff.
- Cleanup, release-gate, and audit checks exist for perception sidecars and default-disabled
  behavior.

Still not truly LLM-backed:

- The current vision fixture path uses `mockVisionProvider`.
- The OpenAI-compatible vision provider receives bounded text/OCR summaries, not production desktop
  frame/image inputs.
- Transcription has only a mock provider and no real local or external transcription provider.
- Memory candidates and Recommendations are mostly deterministic rules.
- The desktop background loop observes Tier 1 app/window/runtime Events, but does not continuously
  process live screen/OCR/audio through configured model providers.
- Perception provider routes are control-plane settings; they are not yet a full runtime provider
  factory across desktop and CLI paths.

## Missing Prerequisites

Goal 9 can start, but the first checkpoints must close these gaps before live model-backed perception
is considered usable:

1. Provider capability registry.
   Orbit needs one runtime registry for text drafting, vision, OCR post-processing, transcription,
   Memory extraction, Recommendation generation, and context compression. The registry must resolve
   disabled, mock, local, and OpenAI-compatible providers from desktop settings, CLI env, and
   per-source policy.
2. Real transcription provider contract.
   The current transcription input has fixture text and redacted summaries, but no safe audio segment
   sidecar contract, upload budget, provider endpoint shape, or failure cleanup path.
3. Real image/vision input contract.
   Goal 8 intentionally avoided raw frame upload. Goal 9 needs a separate image-input contract for
   downsampled/cropped/redacted frames, with image-byte export disabled unless the user explicitly
   enables an external vision provider for the selected source.
4. Live perception runtime bridge.
   ScreenCaptureKit, Apple Vision OCR, microphone/session audio, and any native helper must connect
   into the queue with visible start/pause/resume/stop state. The current smoke path is mock-only.
5. LLM output schemas and review gates.
   Memory and Recommendations need strict schemas, evidence validation, deterministic fallback, and
   review states. LLM output must not auto-confirm Memory or execute side effects.
6. Daily automation scheduler.
   Orbit needs a visible background processor that drains observation/perception queues, runs model
   jobs within budgets, refreshes Today/Handoff, and shows skipped-by-policy states.
7. Evaluation corpus.
   Goal 9 needs fixtures for real provider schema handling, Chinese OCR/transcript summarization,
   blocked protected apps, failed redaction, external-provider denial, noisy recommendation
   suppression, and daily-loop recovery.

If one of these prerequisites blocks a checkpoint, stop at that checkpoint and document the blocker.

## Non-Goals

- Default screen capture, OCR, audio capture, vision, or transcription.
- Silent browser scraping.
- Keystroke capture.
- Password-field capture.
- Arbitrary filesystem scanning.
- Default upload of raw screenshots, raw audio, raw transcripts, raw code, or raw private messages.
- Auto-confirmed Memory.
- Side-effect automation such as sending messages, editing code, creating tasks, or changing files
  based on perceived context.

## Checkpoints

Each checkpoint must be implemented, verified, committed, and pushed independently before the next
one starts.

### Goal 9A: Provider Runtime Registry

Make provider routing real without starting live high-risk capture.

Required scope:

- Add a provider capability registry for `knowledge_draft`, `vision_summary`, `ocr_postprocess`,
  `transcription`, `memory_candidate`, `recommendation`, and `context_compression`.
- Resolve providers from desktop settings, CLI env, perception provider routes, source policy, and
  operation-specific budgets.
- Keep disabled and mock providers valid for every task.
- Add provider status output that explains configured, disabled, skipped-by-policy, and missing-key
  states.
- Add audit metadata for provider resolution and skipped-by-policy decisions without storing prompts,
  credentials, image bytes, or audio bytes.

Acceptance:

- CLI and Desktop show effective provider resolution for each task.
- Synthetic connection tests use synthetic prompts only.
- No screen, OCR, vision, audio, transcript, Memory, or Recommendation model job runs unless the task
  is explicitly invoked and policy allows it.

### Goal 9B: Real Transcription Provider Path

Add real transcription capability behind explicit source policy.

Required scope:

- Add a transcription provider contract that can process bounded audio segments or local transcript
  sidecars.
- Implement at least one real provider path: local transcription if available, or a clearly named
  OpenAI-compatible audio transcription provider.
- Require explicit microphone/session policy and external-provider consent before sending audio
  bytes outside the machine.
- Enforce audio duration, file size, request rate, retry, and failure cleanup budgets.
- Persist redacted transcript Events with provider metadata, confidence, language, and evidence
  pointers.
- Keep raw audio storage off by default and short-TTL only when enabled.

Acceptance:

- Synthetic audio fixtures can be transcribed by the configured provider.
- Default policy blocks external audio upload.
- Provider failures do not persist unredacted transcript text.
- Audit logs show provider request, success/failure, skipped-by-policy, and cleanup metadata.

### Goal 9C: Real Vision/OCR Model Path

Add real model-assisted visual context from bounded screen evidence.

Required scope:

- Add image-capable vision input support separate from text-only screen/OCR summaries.
- Add local OCR provider integration where available, with Chinese and English support.
- Allow external vision model calls only for explicitly enabled sources after redaction,
  downsampling/cropping, protected-app checks, and budget checks.
- Record provider, model, image/text budget, redaction result, and export eligibility.
- Keep text-only vision summarization as the fallback when image bytes are blocked.

Acceptance:

- Synthetic image fixtures can produce OCR and vision summaries through the configured provider.
- Protected-app or failed-redaction frames never reach OCR, vision, Activity, Today, or Handoff.
- External vision calls are disabled by default and require both provider configuration and source
  policy.

### Goal 9D: Live Perception Runtime Bridge

Connect the desktop runtime to real opt-in perception sources.

Status: blocked as of 2026-05-21. See
[Goal 9D Live Perception Runtime Blocker](./goal-9d-live-perception-runtime-blocker.md). Do not
continue to Goal 9E or Goal 9F until the blocker is resolved and 9D acceptance passes.

Required scope:

- Connect explicit ScreenCaptureKit or native-helper screen/window capture to the observation queue.
- Connect Apple Vision OCR or equivalent local OCR to captured frames.
- Connect explicit meeting/session audio capture and chunking to the transcription queue.
- Show live status, selected scope, queue depth, last processed time, provider state, pause/resume,
  stop, and delete controls.
- Enforce protected apps before capture, OCR, transcription, model use, persistence, and export.
- Run reindexing and model jobs incrementally under resource budgets.

Acceptance:

- A local macOS smoke can start, pause, resume, stop, and delete explicit screen/OCR and audio
  sessions.
- Activity and Today update from live opt-in perception Events.
- Stopping a session tears down streams and prevents delayed jobs from writing new content.

### Goal 9E: LLM Memory And Recommendation Candidates

Make durable context and proactive suggestions model-assisted without losing review control.

Required scope:

- Add LLM-assisted Memory candidate extraction from confirmed Knowledge only.
- Add LLM-assisted Recommendation generation from safe Events, Activity, Knowledge, and confirmed
  Memory.
- Require strict JSON schemas, evidence ID validation, duplicate suppression, confidence bands, and
  deterministic fallback.
- Preserve `needs_review` for Memory and reviewable states for Recommendations.
- Add Chinese and mixed-language prompt/eval fixtures.

Acceptance:

- LLM-generated Memory candidates require confirmed Knowledge and start unconfirmed.
- LLM-generated Recommendations include explanation, suggested action, impact, confidence, and
  evidence.
- Unsupported evidence IDs are rejected or repaired by fallback.
- Dismissed/resolved Recommendations do not reappear without new evidence.

### Goal 9F: Daily Automation Loop And Release Gate

Make "leave Orbit running, get useful daily context" work as an Alpha loop.

Required scope:

- Add a visible background processor for observation drain, perception processing, semantic
  pipeline, Memory candidate scheduling, Recommendation refresh, Today refresh, and Handoff refresh.
- Add manual run, scheduled run, pause, stop, status, and queue controls.
- Show skipped-by-policy, provider-disabled, redaction-failed, protected-app-blocked, and
  budget-exhausted states in Desktop and CLI.
- Add release-gate checks for provider policy, live perception smoke, model-job audit coverage,
  resource budgets, raw sidecar cleanup, and evaluation fixtures.
- Keep all side-effect actions out of scope.

Acceptance:

- With opt-in sources and configured providers, Orbit can process a day of synthetic plus live smoke
  context into Activity, Knowledge drafts, Memory candidates, Recommendations, Today, and Handoff.
- With providers disabled, deterministic fallback still produces a usable Today/Handoff.
- Release gate reports every disabled, skipped, blocked, or failed model/capture path explicitly.

## Goal 9 Acceptance Commands

Each checkpoint may add narrower commands, but the full Goal 9 gate should include:

```bash
rm -rf .tmp/goal-9-acceptance
export ORBIT_HOME="$PWD/.tmp/goal-9-acceptance"
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/ai test
pnpm --filter @orbit/privacy test
pnpm --filter @orbit/adapters test
pnpm --filter @orbit/desktop test
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
pnpm --filter @orbit/cli orbit observe status --json
pnpm --filter @orbit/cli orbit perception status --json
pnpm --filter @orbit/cli orbit perception release-gate --json
pnpm --filter @orbit/cli orbit context today --json
pnpm --filter @orbit/cli orbit handoff today --json
```

Recommended provider and automation checks after their checkpoint commands exist:

```bash
pnpm --filter @orbit/cli orbit ai status --json
pnpm --filter @orbit/cli orbit ai test --task knowledge_draft --json
pnpm --filter @orbit/cli orbit ai test --task vision_summary --json
pnpm --filter @orbit/cli orbit ai test --task transcription --json
pnpm --filter @orbit/cli orbit perception transcribe-fixture --json
pnpm --filter @orbit/cli orbit perception vision-fixture --json
pnpm --filter @orbit/cli orbit automation run-once --json
pnpm --filter @orbit/cli orbit automation status --json
pnpm --filter @orbit/cli orbit automation release-gate --json
```

## Completion Criteria

Goal 9 is complete only when:

- Provider routes are runtime-effective across CLI and Desktop, not only stored settings.
- Real transcription and real vision/OCR provider paths work on synthetic fixtures and local macOS
  smoke inputs.
- Live opt-in screen/OCR/audio sessions can feed Events and derived context.
- LLM-generated Knowledge, Memory candidates, and Recommendations use strict schemas and evidence
  validation.
- The daily background processor visibly refreshes Today and Handoff under provider, redaction,
  protected-app, retention, and resource policies.
- The product remains usable with all external providers disabled.
- Raw media and external provider use remain off by default and auditable when enabled.
