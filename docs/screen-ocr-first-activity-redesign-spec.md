# Screen/OCR-First Activity Redesign Spec

Last updated: 2026-05-23

## Purpose

This spec changes Orbit's near-term product priority from metadata-first background observation to a
Yansu-like, Screen/OCR-first Activity system.

Orbit should still keep the stable product chain:

```text
Source Adapter
  -> Event
  -> Activity Session
  -> Knowledge Artifact
  -> Memory
  -> Recommendation
  -> Handoff / Agent Interface
```

The change is about the primary evidence source. App/window metadata should become scheduling,
safety, and attribution infrastructure. Screen/OCR frame sampling should become the main way Orbit
understands "what the user is actually doing" during real desktop work.

## Evidence Basis

This design is based on three evidence classes.

### Verified From Local Yansu References

The repository includes Yansu reference screenshots in `docs/assets/yansu/` and a UI analysis in
[docs/ui-design.md](./ui-design.md).

The key Activity evidence:

- `docs/assets/yansu/yansu-activity-playback-reference-04.jpg` shows one Activity from
  `16:37:49 - 16:42:39`, duration `4m 50s`, with `90` events and `6` frames. The UI includes a
  recording preview, playback controls, frame progress `1 / 6`, a scrubber, app labels, local-state
  copy, and an event stream.
- `docs/assets/yansu/yansu-activity-timeline-reference-02.jpg` shows one Activity from
  `15:34:19 - 16:32:41`, duration `58m 22s`, with `1397` events and `163` frames. The UI includes a
  recording preview, playback controls, playback speed `4x`, a dense scrubber, app labels, local
  state, and event stream.
- `docs/ui-design.md` records observed Yansu settings that mention required Screen Recording and
  Accessibility permissions, background observation, protected apps, retention, local storage, and
  Activity recording.

These artifacts verify that Yansu's Activity layer is not just app/window metadata and not just a
single screenshot. It is a time-bounded Activity Session with many events plus many visual frames.

### User Observation

The user observed Yansu periodically beginning screen capture, with each capture period producing
multiple frames. This fits the local screenshots, but the exact internal schedule is not publicly
verified.

### Product Inference

The most plausible architecture is:

```text
Background runtime
  -> periodic or event-triggered capture bursts
  -> multiple screen frames per burst
  -> OCR / event extraction
  -> Activity Session playback
  -> Knowledge / Memory / Handoff
```

This spec treats that as a product design target, not as a claim about Yansu's private
implementation.

## Product Repositioning

Previous docs leaned toward:

```text
App/window metadata and Accessibility first
Screen/OCR as a later high-risk supplement
```

The new target is:

```text
Screen/OCR frame sampling first for real work understanding
App/window metadata as safety, scheduling, and attribution context
Accessibility/browser/terminal/filesystem metadata as later semantic enrichments
```

The product promise becomes:

- Orbit can reconstruct the recent working scene as Activity Sessions.
- Each session has time range, apps, event count, frame count, source policies, privacy state, and
  playback frames.
- Knowledge is generated from the Activity Session as a whole, not from isolated frames.
- Memory is derived only from reviewed Knowledge or explicit user confirmation.
- Handoff exports summaries and source pointers, not raw screen frames or raw OCR dumps by default.

## Core Concepts

### Activity Session

The user-facing unit of work. It answers:

- What happened during this period?
- Which apps and sources were involved?
- What visual/text evidence exists?
- What did Orbit derive from it?

Activity duration is not fixed. A session can be `4m 50s`, `58m 22s`, or another length depending on
work continuity.

### Capture Burst

A short capture episode that samples several frames while the user is active and the current
foreground context is safe.

Example default policy:

- Check eligibility every `30-60s`.
- If eligible, capture `3-8` frames.
- Space frames `0.5-2s` apart.
- Hash, diff, and OCR each frame.
- Persist bounded summaries immediately.
- Persist raw image sidecars only if user enabled short-TTL retention.

Capture Burst is not the same as Activity Session. Many bursts can belong to one session.

### Screen Frame

A single captured display/window/app/region image or thumbnail produced by a burst.

Required metadata:

- frame ID,
- runtime session ID,
- burst ID,
- occurredAt / observedAt,
- display/window/app/region scope,
- app and optional window title,
- frame hash,
- dimensions,
- diff score or duplicate flag,
- protected/suppressed state,
- raw sidecar policy,
- OCR status,
- retention expiry.

### OCR Text Observation

Bounded text extracted from a frame. It should support Chinese and English and must pass redaction
before persistence or model use.

OCR text is evidence for Activity and Knowledge. It is not a raw transcript of the whole screen by
default.

## Target Architecture

```text
Desktop Runtime
  -> App/Window Safety Probe
  -> Screen Capture Burst Scheduler
  -> Native ScreenCaptureKit Helper
  -> Local OCR / Vision Provider
  -> Perception Event Queue
  -> Event Store
  -> Activity Session Builder
  -> Activity Playback Index
  -> Knowledge Draft Engine
  -> Memory Candidate Engine
  -> Recommendation Engine
  -> Handoff Pack
```

### Role Of App/Window Observation

App/window observation remains necessary, but it is no longer the core understanding source.

It is used to:

- determine foreground app/window,
- enforce protected-app and protected-window suppression before capture,
- decide whether capture is allowed,
- annotate frames and Events with app/window source metadata,
- help Activity Session boundaries,
- explain why a burst was skipped,
- provide fallback context when screen capture is disabled or unavailable.

### Role Of Screen/OCR

Screen/OCR is the primary real-work evidence source.

It is used to:

- understand visible coding, browser research, design review, chats, docs, and app workflows,
- generate Activity playback frames,
- extract Chinese/English text for semantic summarization,
- produce Knowledge drafts with concrete evidence,
- help Handoff explain current work without raw media export.

## Runtime Model

### States

Each high-risk perception source should expose:

- `not_configured`,
- `needs_permission`,
- `ready`,
- `collecting`,
- `paused`,
- `warning`,
- `error`,
- `disabled`.

Runtime state is per source and global:

- global observation,
- screen frame sampler,
- OCR processor,
- vision summarizer,
- raw sidecar cleanup,
- activity summarization jobs.

### Start Flow

The user must explicitly enable Screen/OCR observation.

Start flow:

1. Explain what will be captured.
2. Request macOS Screen Recording permission if missing.
3. Ask user to choose scope: display, app, window, or region.
4. Show protected apps and exclusions.
5. Show sampling policy and raw retention policy.
6. Start in visible `collecting` state.
7. Write audit entry.

### Pause, Resume, Stop

Pause:

- stops new capture immediately,
- cancels scheduled bursts,
- allows already persisted summaries to remain,
- does not delete existing Activity.

Resume:

- re-checks permission,
- re-checks protected app state,
- restarts scheduler.

Stop:

- tears down native helper or stream,
- flushes in-memory frames,
- stops OCR/vision jobs unless already persisted and safe,
- records last stopped time and audit.

Disable/delete:

- requires confirmation,
- supports delete raw sidecars, delete Events, or preserve derived Knowledge choices.

## Capture Burst Scheduling

### Eligibility

A burst can start only when all conditions pass:

- screen source enabled,
- runtime not paused,
- Screen Recording permission granted,
- current foreground app/window not protected,
- user activity recently observed,
- CPU/storage/battery budget available,
- queue below limit,
- previous burst outside minimum interval,
- no recent redaction failure for the same app/window,
- scope still valid.

### Trigger Signals

Initial triggers:

- timer interval,
- app/window change,
- long-running focused work in same app,
- event density increase,
- user manually clicks capture now.

Future triggers:

- meeting start,
- visible error detection,
- repeated active coding/browser workflow,
- user-defined project or app rules.

### Default Sampling Policy

The first production default should be conservative:

```text
minimumBurstIntervalSeconds: 60
framesPerBurst: 4
frameSpacingMs: 1000
maxOcrFramesPerMinute: 6
maxCaptureDutyCyclePercent: 10
rawFrameRetention: disabled
rawFrameTtlIfEnabledMinutes: 60
protectedAppAction: skip_capture
externalAiUse: disabled
```

The user can later choose presets:

- Conservative: every 2-5 minutes, 2-4 frames.
- Balanced: every 60 seconds, 4 frames.
- Intensive: every 30 seconds, 6-8 frames, visible warning and stronger budget controls.

### Burst Output

Each burst creates:

- one `capture_burst` runtime/audit record,
- zero or more `screen_observation` Events,
- zero or more `ocr_text` Events,
- skip/block audit entries when protected or over budget,
- optional raw sidecar references if enabled.

Duplicate frames should be suppressed by hash/diff before OCR where possible.

## Activity Session Builder

Activity Sessions should be semantic work segments, not fixed time buckets.

### Inputs

- screen frame Events,
- OCR Events,
- app/window focus Events,
- accessibility/browser/terminal/filesystem metadata when available,
- runtime state Events,
- permission/protected-app skip Events,
- optional audio/transcript Events later.

### Boundary Signals

Close or split a session when:

- idle threshold exceeded,
- app/project/topic changes significantly,
- protected app occupies foreground long enough,
- meeting starts or ends,
- user manually pauses/stops,
- screen scope changes,
- OCR/window/browser/repo topic changes,
- event density collapses,
- max session duration reached,
- midnight/day boundary reached.

Continue a session when:

- bursts share app/project/topic,
- OCR text is semantically related,
- browser/terminal/file metadata points to same project,
- event density indicates continuous work,
- meeting remains ongoing.

### Session Quality Score

Knowledge draft generation should depend on Activity quality.

Suggested factors:

- duration,
- frame count,
- non-duplicate frame count,
- OCR text volume after redaction,
- app/source diversity,
- project/topic confidence,
- event density,
- presence of decisions/follow-ups/errors,
- redaction safety,
- user review signal.

Low-quality sessions can remain visible in Activity but should not automatically generate Knowledge.

## Event And Data Model Changes

Existing `screen_observation` and `ocr_text` Events remain valid. The redesign needs richer metadata
around bursts and frames.

Recommended additions:

### Capture Burst

Capture Burst should be a first-class persisted read model, not only an audit-log detail. Audit logs
record decisions and failures, but Activity playback needs queryable burst/frame metadata after raw
sidecars expire.

```ts
interface CaptureBurst {
  id: string;
  runtimeSessionId: string;
  sourceKind: "screen";
  startedAt: string;
  endedAt?: string;
  trigger: "timer" | "app_change" | "manual" | "runtime_recovery";
  scope: ScreenCaptureScope;
  app?: string;
  windowTitle?: string;
  status: "completed" | "skipped" | "partial" | "failed";
  skipReason?: string;
  frameCount: number;
  ocrEventCount: number;
  auditLogIds: string[];
}
```

### Frame Metadata

Frame metadata should live in a queryable side table keyed by Event ID and frame ID. A bounded copy
can also appear in `Event.content.metadata`, but playback, cleanup, and TTL enforcement should not
depend on parsing audit logs.

```ts
interface ScreenFrameMetadata {
  burstId: string;
  frameIndex: number;
  frameHash: string;
  perceptualHash?: string;
  width: number;
  height: number;
  diffScore?: number;
  duplicateOfFrameId?: string;
  rawSidecarId?: string;
  rawExpiresAt?: string;
  thumbnailRef?: string;
  ocrStatus: "pending" | "completed" | "skipped" | "failed";
}
```

### Activity Media

`ActivitySession.media` should become playback-friendly and reference the frame side table:

```ts
interface ActivityPlaybackFrame {
  eventId: string;
  frameId: string;
  burstId: string;
  timestamp: string;
  sourcePointer: string;
  app?: string;
  windowTitle?: string;
  thumbnailRef?: string;
  rawRef?: string;
  rawAvailable: boolean;
  redactionState: "none" | "redacted" | "failed";
  summary: string;
}
```

Raw references must remain optional. Playback should work from thumbnails, summaries, and source
pointers when raw images expire.

## Storage And Retention

Default policy:

- Store Events, summaries, hashes, source pointers, and thumbnails when safe.
- Do not store raw full-resolution screenshots by default.
- If raw screenshot retention is enabled, use short TTL and per-source cap.
- Cleanup raw sidecars without breaking Activity, Knowledge, Memory, or Handoff.
- Never store protected-app frames.
- Never use OCR to bypass protected-app or denied Accessibility policy.

Recommended Alpha defaults:

- raw screenshots disabled,
- thumbnails enabled only if redacted/safe,
- OCR summary retained,
- OCR raw text bounded and redacted,
- raw TTL if enabled: `60 minutes`,
- raw storage cap: `250 MB`,
- cleanup cadence: `15 minutes`.

## Privacy And Permission Requirements

Screen/OCR-first does not weaken privacy requirements. It makes them more important.

Required controls:

- visible menu bar state while sampling,
- Settings and Sources runtime state,
- start/pause/resume/stop/disable/delete,
- protected app list,
- protected window title patterns,
- browser domain exclusions when metadata is available,
- ignore current app/window action,
- sampling preset selector,
- raw sidecar TTL selector,
- audit log viewer,
- delete all screen/OCR data action.

Hard blocks:

- no default screen capture,
- no silent capture,
- no keystroke capture,
- no password-field capture,
- no protected-app capture,
- no arbitrary filesystem scanning,
- no external AI over frames by default,
- no raw media in default Handoff.

## AI And OCR Provider Policy

### OCR

Preferred Alpha path:

- Apple Vision OCR or local OCR,
- Chinese and English enabled,
- bounded output,
- redaction before persistence,
- no external OCR provider by default.

### Vision Summary

Vision summary is useful, but should come after frame capture and OCR are safe.

Rules:

- disabled by default,
- mock provider for tests,
- local provider preferred,
- external provider only after explicit per-source policy,
- no failed-redaction frames,
- downsample/crop before model call,
- audit every call,
- persist bounded summary and provider metadata.

### Knowledge Drafting

Knowledge should use Activity-level evidence, not individual frames.

Inputs:

- Activity summary,
- selected OCR snippets,
- screen frame summaries,
- app/window timeline,
- source policies,
- existing confirmed Memories.

Outputs:

- Chinese Knowledge draft by default when user locale is Chinese,
- Metadata,
- Description,
- Key Insights,
- Decisions,
- Blockers,
- Follow-ups,
- Evidence source sessions and source pointers.

## Desktop UI Requirements

### Menu Bar / Tray

Show:

- collecting / paused / warning / error,
- current source: screen/OCR,
- last burst time,
- current app or protected-app skip state,
- next scheduled burst,
- raw sidecar policy,
- pause/stop actions.

### Settings

Add Screen/OCR-first runtime controls:

- Screen Recording permission status,
- capture scope,
- sampling preset,
- frames per burst,
- burst interval,
- OCR enabled,
- raw screenshot retention,
- protected apps,
- storage cap,
- cleanup status,
- AI provider policy.

### Sources

Show each perception source:

- screen,
- OCR,
- vision,
- app/window metadata,
- future audio/transcript.

For each source:

- enabled,
- paused,
- last run,
- last success,
- last error,
- next run,
- policy boundary,
- export eligibility,
- audit link.

### Activity Timeline

Activity list items should show:

- time range,
- duration,
- apps,
- event count,
- frame count,
- OCR page/text count,
- local/raw state,
- meeting or protected markers,
- quality score when available.

### Activity Playback

The detail pane should show:

- large frame/thumbnail preview,
- play/pause,
- previous/next frame,
- playback speed,
- frame progress such as `1 / 163`,
- scrubber with frame and event marks,
- full screen,
- event stream below,
- OCR snippets linked to frames,
- source policy and retention state,
- derived Knowledge/Memory/Recommendation links.

Playback must still be useful when raw frames are gone:

- show thumbnail if retained,
- otherwise show frame summary,
- show source pointer and raw-expired state.

### Knowledge

Knowledge detail should cite Activity Session and frame evidence.

Minimum sections:

- Metadata,
- Description,
- Key Insights,
- Decisions,
- Blockers,
- Follow-ups,
- Source Activity Sessions,
- Evidence.

### Handoff

Default Handoff may include:

- Activity summaries,
- confirmed Knowledge,
- confirmed Memory,
- Recommendations,
- source pointers,
- frame counts,
- redaction/export explanations.

Default Handoff must exclude:

- raw screenshots,
- raw OCR dumps,
- thumbnails unless explicitly exportable,
- failed-redaction Events,
- protected-app evidence,
- draft Knowledge,
- unconfirmed Memory.

## CLI Requirements

Add or extend commands:

```bash
orbit perception status --json
orbit perception screen start --scope <display|window|app|region>
orbit perception screen pause
orbit perception screen resume
orbit perception screen stop
orbit perception screen capture-now
orbit perception screen cleanup
orbit activity frames <activity-id> --json
orbit activity playback <activity-id> --json
```

All commands must work against a clean `ORBIT_HOME` without reading private data.

## Implementation Checkpoints

This redesign should replace the previous "metadata first, perception later" ordering with these
checkpoint-sized goals.

### Goal A: Screen/OCR Control Plane And Permission UX

Deliver:

- Screen/OCR source policies,
- Screen Recording permission status,
- sampling preset settings,
- raw retention settings,
- protected app settings,
- visible runtime state,
- audit events,
- CLI status.

Do not capture real frames yet.

Acceptance:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/cli orbit perception status --json
pnpm --filter @orbit/desktop test
```

### Goal B: Native Capture Burst Helper

Deliver:

- ScreenCaptureKit helper boundary,
- mock helper,
- permission handling,
- capture scope,
- capture burst object,
- multiple frames per burst,
- protected app skip before capture,
- audit for burst start/skip/end.

Acceptance:

```bash
pnpm test
pnpm typecheck
pnpm --filter @orbit/adapters test
pnpm --filter @orbit/desktop test
```

### Goal C: OCR Event Pipeline

Deliver:

- Apple Vision/local OCR path,
- Chinese/English recognition,
- OCR redaction,
- frame hash/diff duplicate suppression,
- `screen_observation` and `ocr_text` Events,
- no raw frame storage by default.

Acceptance:

```bash
pnpm test
pnpm typecheck
pnpm --filter @orbit/cli orbit activity list --json
```

### Goal D: Activity Playback Frames

Deliver:

- Activity frame index,
- frame count and event count in Activity,
- playback UI,
- scrubber,
- event stream linked to frames,
- raw-expired state.

Acceptance:

```bash
pnpm test
pnpm typecheck
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
```

### Goal E: Session Boundary And Quality Engine

Deliver:

- burst-to-session grouping,
- semantic boundaries,
- idle/meeting/protected transitions,
- session quality score,
- low-quality session suppression from Knowledge,
- explainable close reason.

Acceptance:

```bash
pnpm test
pnpm typecheck
pnpm --filter @orbit/core test
pnpm --filter @orbit/db test
```

### Goal F: Knowledge, Memory, Recommendation, Handoff Integration

Deliver:

- Activity-level Chinese Knowledge drafts,
- Memory candidates from confirmed Knowledge only,
- Recommendation generation from visible errors/follow-ups/context gaps,
- Handoff summary/source-pointer export,
- raw/private exclusion reasons.

Acceptance:

```bash
pnpm test
pnpm typecheck
pnpm --filter @orbit/cli orbit context today --json
pnpm --filter @orbit/cli orbit handoff today --json
```

### Goal G: Alpha Hardening

Deliver:

- resource budgets,
- low battery/resource policy model,
- raw sidecar cleanup,
- audit review UI,
- native helper packaging smoke,
- macOS permission smoke checklist,
- release limitations doc.

Acceptance:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop package:smoke
pnpm --filter @orbit/desktop test:e2e
```

## Migration From Current Roadmap

Current docs still say app/window metadata and Accessibility should be prioritized before
screenshots. After this redesign:

- Goal 1 Background Runtime Productization remains valid.
- Goal 2 Real App/Window Observation remains useful as safety/scheduling infrastructure.
- Existing Goal 3 Permissioned Semantic Sources should move behind Screen/OCR-first checkpoints,
  except where a metadata source directly improves capture safety or Activity boundaries.
- Existing Goal 8 perception work should be pulled forward and split into the Goal A-G sequence
  above.
- Browser/terminal/filesystem metadata should enrich Activity after Screen/OCR playback exists.

## Open Questions

- What default sampling preset should Alpha expose first: Conservative or Balanced?
- Should raw thumbnails be retained by default if full raw screenshots are disabled?
- Should Activity playback be allowed to render OCR text when thumbnails expire?
- What is the max acceptable storage footprint for a normal workday?
- Should user activity detection rely on app/window events only, or also idle APIs?
- How should protected browser domains be configured before browser metadata support lands?
- Should meeting sessions force longer Activity boundaries even when app/window changes?
- Which local OCR implementation should ship first: Apple Vision helper only, or provider interface
  with Apple Vision as the first provider?

## Success Criteria

The redesign is successful when:

- A user explicitly enables Screen/OCR observation.
- Orbit periodically captures safe bursts of multiple frames.
- Each burst becomes traceable screen/OCR Events.
- Related bursts are grouped into variable-length Activity Sessions.
- Activity shows frame count, event count, playback, scrubber, event stream, and local/privacy state.
- Knowledge drafts summarize whole Activity Sessions in Chinese with evidence.
- Memory candidates require review.
- Handoff explains recent work with summaries and source pointers only.
- Protected apps, failed redaction, raw screenshots, and non-exportable sources stay out of default
  Handoff.
- Clean `ORBIT_HOME` still starts with no screen/OCR capture enabled.
