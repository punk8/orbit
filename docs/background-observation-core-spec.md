# Background Observation Core Spec

## Purpose

This document defines Orbit's core product target after the initial local-data spine:

```text
Background Observation -> Event -> Activity Session -> Knowledge Artifact -> Memory -> Recommendation
```

For concrete engineering slices, module boundaries, macOS capture choices, event mappings, and test
strategy, see
[Background Observation Implementation Plan](./background-observation-implementation-plan.md).

Orbit's core value is not only importing explicit source files. The product must run quietly in the
background, observe authorized computer activity, and turn that activity into traceable work context.

This does not mean unrestricted surveillance or a screenshot search product. The first production
shape should capture the minimum useful desktop signals, preserve source pointers, avoid raw payload
retention by default, and let the user pause, inspect, delete, and govern everything Orbit derives.

## Product Boundary

Background observation is first-class. Screen recording, OCR, and audio are gated high-risk inputs.

The complete observation stack has three tiers:

1. **Tier 1: Low-risk desktop telemetry**
   - Active app changes.
   - Active window title changes.
   - App focus duration.
   - Explicit source adapter runtime events.
   - User-visible Orbit runtime state.

2. **Tier 2: Permissioned semantic desktop context**
   - Accessibility text snapshots.
   - Browser URL/title when available through accessibility or explicit extension/API.
   - Terminal command observation through approved shell integration or terminal log source.
   - Clipboard metadata or text only when explicitly enabled.
   - File activity under explicit allowlisted directories.

3. **Tier 3: High-risk perception**
   - Screen frames.
   - OCR over screenshots.
   - Audio capture.
   - Meeting transcription.

Tier 1 and Tier 2 form the first background-observation core. Tier 3 stays disabled until the
permission UX, visible running state, redaction, retention, app exclusions, storage budgets, and
audit trail are complete.

## Non-Goals

- Silent screen recording.
- Continuous raw screenshot archive.
- Default audio capture.
- Keystroke logging.
- Reading password fields.
- Capturing protected apps.
- Sending observed content to external AI by default.
- Treating every observation as Memory.
- External side-effect automation.

## User Promise

When background observation is enabled, Orbit must make these facts clear:

- What is being observed.
- Which permissions are required.
- Whether collection is running or paused.
- Which apps, windows, folders, or sources are excluded.
- What was stored as Event metadata.
- Whether raw text, screenshots, or audio were stored.
- Which derived objects were created.
- How to delete or disable the source.

## Required UI States

Orbit needs a visible runtime state in the menu bar and app:

- `not_configured`: no background observation source is configured.
- `needs_permission`: a required OS or integration permission is missing.
- `ready`: configured but not actively collecting.
- `collecting`: observation is running.
- `paused`: user paused observation.
- `warning`: collecting with partial failures.
- `error`: collection cannot proceed.
- `disabled`: source is disabled.

Required controls:

- Start observation.
- Pause observation.
- Resume observation.
- Stop/disable observation.
- Configure protected apps.
- Configure allowed folders.
- Configure clipboard capture.
- Configure Accessibility capture.
- Configure screen/OCR/audio gates separately.
- Run privacy cleanup.
- Export debug bundle without raw payloads.
- Clear local observation data with confirmation.

## Permission Model

### macOS Permission Classes

Tier 1:

- App/window focus may use Electron APIs and OS workspace notifications where possible.
- If richer window titles require Accessibility, Orbit must request Accessibility before enabling.

Tier 2:

- Accessibility is required before reading UI element text.
- File activity requires explicit folder selection or allowlist.
- Clipboard capture requires explicit in-app enablement, even if OS does not show a permission
  dialog.
- Browser URL capture requires Accessibility, browser extension/API, or explicit browser history
  import. Do not scrape browser internals silently.

Tier 3:

- Screen Recording is required before screen frames or OCR.
- Microphone/System Audio permission is required before audio capture.
- These permissions must have separate toggles and stronger warnings than Tier 1/Tier 2.

### Permission Scope

Each observation adapter must declare:

- Source kind.
- Readable fields.
- Whether raw text can be stored.
- Whether screenshots/audio can be stored.
- Whether summaries can be stored.
- Whether data can be used for AI.
- Whether data can be exported to agents.
- Retention policy.
- Protected-app exclusions.

## Event Types

Background observation should extend the Event vocabulary with desktop-specific event types.

Required types:

- `app_focus`
- `window_focus`
- `window_title_change`
- `accessibility_snapshot`
- `browser_navigation`
- `terminal_command`
- `terminal_output_summary`
- `clipboard_change`
- `file_activity`
- `screen_observation`
- `ocr_text`
- `audio_segment`
- `transcript_segment`
- `observation_state`
- `permission_state`

Event requirements:

- Every event has source pointer, timestamp, app, optional window title, optional URL, sensitivity,
  retention policy, redaction state, and hash.
- Events created from raw snapshots must store summary and source pointer first.
- Raw text, screenshots, audio, and transcripts are optional sidecars controlled by policy.
- Secret, password-field, protected-app, and failed-redaction observations must not store raw payloads.

## Source Pointers

Use explicit source pointer schemes:

- `desktop://app-focus/<session-id>#<sequence>`
- `desktop://window/<session-id>#<sequence>`
- `accessibility://snapshot/<session-id>#<sequence>`
- `browser://navigation/<profile-or-app>/<timestamp>`
- `terminal://session/<id>#<command-index>`
- `clipboard://change/<session-id>#<sequence>`
- `filesystem://watch/<root-id>/<relative-path>#<event-id>`
- `screen://capture/<session-id>#<frame-id>`
- `ocr://capture/<session-id>#<frame-id>`
- `audio://capture/<session-id>#<segment-id>`
- `transcript://meeting/<id>#<segment-id>`

Pointers should be stable enough for audit but must not reveal more path or private detail than
needed.

## Collection Strategy

### Event-Driven First

Prefer event-driven capture:

- App activation notifications.
- Window focus changes.
- File-system watcher events under allowlisted roots.
- Shell integration hooks.
- Browser extension/API events.
- Adapter cursor changes.

### Bounded Polling

Use bounded polling only when event-driven APIs are unavailable.

Polling requirements:

- Configurable interval.
- CPU budget.
- Backoff on repeated failures.
- No high-frequency screenshots by default.
- Deduplicate repeated app/window/accessibility snapshots.

### Debounce And Deduplication

Observation should deduplicate:

- Same app/window repeated within a short interval.
- Same Accessibility text hash.
- Same browser URL/title.
- Same clipboard content hash.
- Same file path event burst.
- Same terminal command source pointer.

Events should be compact enough that Activity Session building is useful without needing raw
recordings.

## Privacy Rules

Default policies:

| Observation | Raw storage default | Summary storage | AI default | Agent export default |
| --- | --- | --- | --- | --- |
| App focus | off/not applicable | allowed | allowed | allowed |
| Window title | off | allowed | policy-based | policy-based |
| Accessibility text | off | allowed after redaction | blocked unless enabled | blocked unless enabled |
| Browser URL/title | off | allowed after redaction | policy-based | policy-based |
| Terminal command | off | allowed after redaction | policy-based | policy-based |
| Terminal output | off | summary only | blocked by default | blocked by default |
| Clipboard | off | summary/hash only | blocked by default | blocked by default |
| File activity | off | metadata/summary | policy-based | policy-based |
| Screen frame | short TTL only | allowed after OCR/redaction | blocked by default | blocked by default |
| OCR text | off | allowed after redaction | blocked by default | blocked by default |
| Audio | short TTL only | transcript summary | blocked by default | blocked by default |
| Transcript | off | allowed after redaction | blocked by default | blocked by default |

Protected app behavior:

- If a protected app is foreground, Orbit records only a redacted `app_focus` event unless the user
  explicitly overrides that app.
- No Accessibility text, OCR, screenshot, clipboard text, or audio transcript should be stored for
  protected apps by default.

Secret handling:

- Password fields are never captured.
- Tokens, keys, passwords, private keys, cookies, and authorization headers are redacted.
- If redaction fails, raw payload is dropped and event redaction state is `failed`.
- Failed-redaction events are excluded from default Handoff and external AI.

## Runtime Pipeline

Background observation should feed a local queue:

```text
Observation Adapter
  -> Capture Queue
  -> Privacy Filter / Redaction
  -> Event Ingestion
  -> Activity Session Incremental Builder
  -> Draft Knowledge Scheduler
  -> Memory Candidate Scheduler
  -> Recommendation Scheduler
  -> Review Queue / Today / Handoff
```

### Capture Queue

Requirements:

- Local-only queue.
- Backpressure when DB or pipeline is busy.
- Per-source retry and warning state.
- Bounded queue length.
- Drop raw payload before dropping metadata when under pressure.

### Incremental Activity Builder

Requirements:

- Maintain active Activity Sessions in near real time.
- Close sessions after inactivity, project switch, meeting end, source thread end, or user-defined
  idle threshold.
- Reopen or merge sessions when later evidence clearly belongs to the same workstream.
- Preserve user-reviewed Knowledge/Memory when rebuilding.

### Knowledge Scheduler

Knowledge should not be generated for every micro-event.

Generate drafts when:

- A session closes.
- A daily review is requested.
- A meeting/discussion ends.
- A debugging sequence reaches verification.
- The user explicitly asks for a recap.

### Memory Scheduler

Memory candidates should only come from:

- Confirmed Knowledge.
- Explicit user save.
- Trusted high-confidence policy added later.

### Recommendation Scheduler

Recommendations can be generated from:

- Follow-up Events.
- Repeated manual workflows.
- Stale accepted recommendations.
- Unclosed blockers.
- Missing verification after code/test activity.
- Context gaps before handoff.

Recommendations must stay evidence-backed and side-effect-free.

## Desktop Shell Requirements

The Electron app owns:

- Menu bar lifecycle.
- Start/pause/resume/stop controls.
- Permission onboarding.
- Background observation service lifecycle.
- Settings for sources, protected apps, retention, AI, and export.
- Review UI.
- Local data operations.

Native helper may be required for:

- Reliable active-window metadata.
- Accessibility traversal beyond Electron capabilities.
- ScreenCaptureKit.
- Apple Vision OCR.
- Audio capture/VAD/transcription.
- Permission status checks.

Native helper constraints:

- Small API surface.
- Local IPC only.
- No network.
- Auditable command set.
- Raw payload handling behind explicit policy.

## Acceptance Commands

Once implemented, the background observation core should expose testable commands or smoke tests:

```bash
pnpm test
pnpm typecheck
pnpm --filter @orbit/desktop test
pnpm --filter @orbit/desktop test:e2e
pnpm --filter @orbit/cli orbit status --json
pnpm --filter @orbit/cli orbit activity list --json
pnpm --filter @orbit/cli orbit context today --json
```

Optional diagnostic commands may include:

```text
orbit observe status --json
orbit observe permissions --json
orbit observe test-snapshot --json
orbit observe protected-apps --json
```

## Functional Acceptance

The first usable background-observation core is done when:

- A fresh user can launch Orbit and see observation setup.
- The user can grant or skip required permissions.
- Orbit can run in the menu bar/background.
- Pause/resume is visible and works.
- Tier 1 events are captured without raw private payloads.
- Tier 2 events are captured only after explicit permission/setup.
- Protected apps suppress sensitive capture.
- Events become Activity Sessions.
- Activity Sessions can produce Knowledge drafts.
- Confirmed Knowledge can produce Memory candidates.
- Recommendations are generated from observed follow-ups or risks.
- Today reflects observed work context.
- Handoff excludes unsafe raw observation payloads by default.
- Clear local data and privacy cleanup work.

## Development Order

Implement background observation after the local Event/Activity/Knowledge/Memory spine exists.

Recommended phases:

1. Observation data model and fixtures.
2. Runtime state and permission UI.
3. Tier 1 app/window observer.
4. Tier 2 Accessibility and explicit filesystem observer.
5. Incremental session builder and scheduler.
6. Protected apps, redaction, retention, and audit hardening.
7. Tier 3 screen/OCR/audio gates only after the above is stable.
