# Background Observation Implementation Plan

## Purpose

This document turns [Background Observation Core Spec](./background-observation-core-spec.md) into
an engineering plan that can be implemented against the current TypeScript/Electron codebase.

The goal is to make Orbit observe authorized computer activity in the background and feed that
activity into the existing pipeline:

```text
Observation Source -> Event -> Activity Session -> Knowledge Artifact -> Memory -> Recommendation
```

This plan intentionally separates mockable runtime plumbing from real macOS capture so the first
code goal can be tested deterministically before relying on OS permissions.

## Current Codebase Baseline

Relevant existing modules:

- `packages/core`: domain types, Event ingestion helpers, Activity builder, Knowledge/Memory/
  Recommendation generation, Handoff shape.
- `packages/db`: SQLite repositories, semantic pipeline, governance actions, local data operations,
  Handoff builders.
- `packages/adapters`: fixture, Codex, local agent, and approved SeaTalk adapters.
- `apps/desktop/electron`: Electron main process, background ingestion timer, IPC handlers, local
  data facade.
- `apps/desktop/src`: Today, Activity, Knowledge, Memory, Recommendations, Handoff, Review Queue,
  Sources, Settings UI.
- `apps/cli`: status, ingest, pipeline, read models, context, handoff commands.

The observation implementation should reuse these boundaries. Do not create a separate product path
that bypasses Event ingestion or repositories.

## Implementation Strategy

Build in six slices:

1. **4A: Observation domain and fixture stream**
2. **4B: Runtime state, permission model, and UI controls**
3. **4C: Mock observer to Event ingestion**
4. **4D: Real Tier 1 macOS app/window observer**
5. **4E: Live pipeline integration into Activity/Today/Handoff**
6. **4F: Tier 2 gates for Accessibility, filesystem, terminal/browser metadata, and clipboard**

Do not implement Tier 3 screen/OCR/audio in these slices unless a later task explicitly adds the
stronger permission, protected-app, TTL, redaction, storage, audit, and smoke-test gates.

## Proposed Module Boundaries

### Core

`packages/core` owns portable domain definitions and pure logic.

Add or update:

```text
packages/core/src/types/event.ts
packages/core/src/types/source.ts
packages/core/src/observation/observationTypes.ts
packages/core/src/observation/normalizeObservation.ts
packages/core/src/observation/observationPolicy.ts
packages/core/src/observation/observationState.ts
```

Responsibilities:

- Define observation source kinds and event types.
- Define observation raw event inputs that are not Electron-specific.
- Normalize observation inputs into core `Event` objects.
- Apply pure protected-app and raw-storage policy decisions where possible.
- Define runtime state transitions.

Do not import Electron, Node native APIs, or database code into `packages/core`.

### Adapters

`packages/adapters` owns source adapter implementations and normalizers.

Add:

```text
packages/adapters/src/desktop/desktopObservationAdapter.ts
packages/adapters/src/desktop/desktopObservationNormalizer.ts
packages/adapters/src/desktop/mockDesktopObservationSource.ts
packages/adapters/src/accessibility/accessibilityObservationAdapter.ts
packages/adapters/src/filesystem/fileActivityAdapter.ts
packages/adapters/src/clipboard/clipboardObservationAdapter.ts
packages/adapters/src/browser/browserMetadataAdapter.ts
packages/adapters/src/terminal/terminalObservationAdapter.ts
```

Responsibilities:

- Convert observation source records to Events.
- Implement mock and fixture-backed observation for tests.
- Provide adapter interfaces that Electron can feed with captured observations.
- Keep adapters read-only and side-effect free.

The first code slice should implement only `desktop/*` and mock/fixture flows.

### Desktop Main Process

`apps/desktop/electron` owns runtime lifecycle and OS-facing capture.

Add:

```text
apps/desktop/electron/observation/observationService.ts
apps/desktop/electron/observation/observationRuntime.ts
apps/desktop/electron/observation/permissionStatus.ts
apps/desktop/electron/observation/protectedApps.ts
apps/desktop/electron/observation/tier1MacObserver.ts
apps/desktop/electron/observation/mockObserver.ts
apps/desktop/electron/observation/captureQueue.ts
apps/desktop/electron/observation/observationSettings.ts
```

Responsibilities:

- Start, pause, resume, stop observation.
- Track runtime state.
- Detect permission status.
- Own timers, subscriptions, and native helper calls.
- Queue captured observations.
- Convert observations through adapters and ingest Events.
- Trigger local semantic re-index/scheduling.
- Notify renderer snapshots.

Electron should call into `packages/core`, `packages/adapters`, and `packages/db`; the renderer
should only use preload IPC.

### Desktop Renderer

Update:

```text
apps/desktop/src/orbitApi.ts
apps/desktop/src/routes/SourcesPage.tsx
apps/desktop/src/routes/SettingsPage.tsx
apps/desktop/src/routes/TodayPage.tsx
apps/desktop/src/routes/ActivityPage.tsx
apps/desktop/src/i18n.tsx
```

Responsibilities:

- Show observation runtime state.
- Expose start/pause/resume/stop actions.
- Show permission gates.
- Configure protected apps.
- Show which observation tiers are enabled.
- Display observed Events as normal Activity evidence.

### CLI

Add diagnostic commands:

```text
orbit observe status --json
orbit observe permissions --json
orbit observe protected-apps --json
```

The CLI does not need to start OS capture in the first slice. It should read local runtime/settings
state and support fixture/mock observation tests.

## macOS Technical Path

### Tier 1 App And Window Metadata

Preferred first implementation:

- Use Electron `powerMonitor`, `app`, and BrowserWindow lifecycle only for Orbit runtime state.
- Use a small macOS helper only if Electron cannot reliably provide frontmost app/window metadata.
- Implement a mock observer first and keep the real observer behind a narrow interface.

Candidate real macOS APIs:

- `NSWorkspace.shared.notificationCenter` for active app changes.
- `NSWorkspace.shared.frontmostApplication` for bundle ID, localized name, executable URL.
- `CGWindowListCopyWindowInfo` for frontmost window metadata where available.
- Accessibility API for reliable focused window title if needed and permissioned.

Decision:

- First production Tier 1 may capture app focus without window title if window title requires
  Accessibility.
- Window title capture should be marked `needs_permission` when Accessibility is required.
- Do not block all observation on window-title availability.

### Native Helper Shape

Start without a native helper if possible. If required, implement a small helper with this shape:

```text
apps/desktop/native/macos-observer/
  Sources/
  README.md
  package/build script
```

Helper API should return JSON lines or request/response JSON over local stdio:

```json
{
  "type": "frontmost_app_changed",
  "occurredAt": "2026-05-21T12:00:00.000Z",
  "bundleId": "com.apple.Terminal",
  "appName": "Terminal",
  "windowTitle": "orbit - zsh",
  "pid": 1234
}
```

Constraints:

- No network.
- No writes outside Orbit runtime logs.
- No raw screenshots/audio.
- No keystroke APIs.
- Parent Electron process owns policy, ingestion, and persistence.

### Tier 2 Accessibility

Use Accessibility only after the user enables it.

Implementation path:

- Add permission detector first.
- Add UI state for `needs_permission`.
- Add mock Accessibility snapshots in tests.
- Add real Accessibility traversal later, bounded by:
  - focused app only,
  - protected-app exclusion,
  - password field exclusion,
  - max text length,
  - hash-based deduplication,
  - redaction before persistence.

### Tier 2 Filesystem

Use explicit folder selection/allowlist only.

Implementation path:

- Add allowlisted roots to settings.
- Add dry-run preview of watched paths.
- Ignore known sensitive/cache/dependency paths by default.
- Use Node `fs.watch` or a proven watcher only under selected roots.
- Store metadata and summary, not full file content, by default.

### Tier 2 Browser Metadata

Do not scrape browser profiles or internals silently.

Allowed paths:

- Accessibility-derived URL/title after permission.
- Browser extension/API in a future task.
- Explicit browser history import file.

First implementation should treat browser metadata as unavailable unless one of those paths is
configured.

### Tier 2 Terminal Commands

Allowed paths:

- Explicit shell integration that writes command lifecycle records into Orbit's local source path.
- Explicit terminal log import.
- Local agent/Codex session adapters.

Do not infer shell commands from screen text as the first implementation.

### Tier 2 Clipboard

Clipboard capture is off by default.

If enabled:

- Store hash and content type by default.
- Store redacted summary only if user enables text summaries.
- Never capture while protected app is foreground.
- Never capture suspected secrets.
- Deduplicate by hash.

## Runtime State Machine

Use these states:

- `not_configured`
- `needs_permission`
- `ready`
- `collecting`
- `paused`
- `warning`
- `error`
- `disabled`

Allowed transitions:

```text
not_configured -> ready
not_configured -> needs_permission
needs_permission -> ready
needs_permission -> disabled
ready -> collecting
ready -> disabled
collecting -> paused
collecting -> warning
collecting -> error
collecting -> disabled
paused -> collecting
paused -> disabled
warning -> collecting
warning -> paused
warning -> error
error -> ready
error -> disabled
disabled -> ready
```

State rules:

- `collecting` means at least one enabled observation adapter is actively running.
- `paused` is user intent and must survive app restart.
- `warning` means partial capture failure while at least one source can still run.
- `error` means no enabled observation source can run.
- `needs_permission` blocks only the tier/source that needs permission, not all lower-risk tiers.

Settings keys should be namespaced:

```text
observation.enabled
observation.paused
observation.status
observation.lastStartedAt
observation.lastStoppedAt
observation.lastError
observation.tier1.enabled
observation.accessibility.enabled
observation.filesystem.enabled
observation.clipboard.enabled
observation.screen.enabled
observation.audio.enabled
observation.protectedApps
observation.allowedFolders
observation.dedupeWindowMs
observation.idleThresholdMs
```

## Event Mapping

### App Focus Event

Input:

- app name
- bundle ID
- PID when available
- occurredAt

Event:

```text
source.kind: "desktop"
type: "app_focus"
context.app: app name
content.title: "Focused <app name>"
content.summary: "Frontmost app changed to <app name>."
privacy.sensitivity: "internal"
source.pointer: desktop://app-focus/<runtime-session-id>#<sequence>
```

No raw text.

### Window Focus Event

Input:

- app name
- bundle ID
- window title if allowed
- occurredAt

Event:

```text
source.kind: "desktop"
type: "window_focus"
context.app: app name
context.windowTitle: redacted title when allowed
content.title: "Focused window in <app name>"
content.summary: redacted bounded summary
privacy.sensitivity: "internal" or "confidential" if title is semantic
source.pointer: desktop://window/<runtime-session-id>#<sequence>
```

If the app is protected, omit `windowTitle` and set summary to a protected-app placeholder.

### Accessibility Snapshot Event

Input:

- app name
- window title
- focused element role
- bounded extracted text
- occurredAt

Event:

```text
source.kind: "accessibility"
type: "accessibility_snapshot"
context.app: app name
context.windowTitle: redacted title
content.summary: bounded redacted summary
content.text: only if source policy allows raw text
privacy.sensitivity: "confidential"
source.pointer: accessibility://snapshot/<runtime-session-id>#<sequence>
```

Default raw text storage is off, so `content.text` should usually be removed after summary
generation.

### Browser Navigation Event

Input:

- browser app
- title
- URL if allowed
- occurredAt

Event:

```text
source.kind: "browser"
type: "browser_navigation"
context.app: browser app
context.url: redacted or origin-only URL based on policy
content.title: redacted page title
content.summary: "Browser navigation observed."
source.pointer: browser://navigation/<profile-or-app>/<timestamp>
```

Default URL policy should strip query strings and fragments.

### Terminal Command Event

Input:

- shell session ID
- command
- cwd/project if known
- exit code when known
- occurredAt

Event:

```text
source.kind: "desktop" or "filesystem"
type: "terminal_command"
context.app: terminal app
context.project: project hint
content.title: command name
content.summary: redacted command summary
source.pointer: terminal://session/<id>#<command-index>
```

Do not store full command output by default.

### Clipboard Change Event

Input:

- content type
- content hash
- optional redacted summary
- occurredAt

Event:

```text
source.kind: "desktop"
type: "clipboard_change"
content.title: "Clipboard changed"
content.summary: content type and redacted summary if enabled
source.pointer: clipboard://change/<runtime-session-id>#<sequence>
```

Default raw text storage is off.

### File Activity Event

Input:

- allowed root ID
- relative path
- operation
- content hash when available
- occurredAt

Event:

```text
source.kind: "filesystem"
type: "file_activity"
context.project: inferred from allowed root metadata
content.title: "<operation> <relative path>"
content.summary: bounded metadata summary
source.pointer: filesystem://watch/<root-id>/<relative-path>#<event-id>
```

Avoid full path leakage when displaying outside Settings/Source detail.

## Sampling, Debounce, And Deduplication Defaults

Initial defaults:

- App focus event: emit on change only.
- Window title event: emit on change, with minimum 2 second debounce.
- Accessibility snapshot: maximum once every 10 seconds per app/window, only if text hash changed.
- Clipboard: emit on hash change only.
- Filesystem: debounce bursts for 1 second per path.
- Background observer health heartbeat: at most once every 5 minutes, and only as runtime metadata.
- Idle threshold: 5 minutes.
- Session max gap for same project/app/thread: 15 minutes.

These should be settings-backed but not necessarily user-exposed in the first UI.

Dedup key examples:

```text
app_focus: bundleId
window_focus: bundleId + redactedWindowTitle
accessibility_snapshot: bundleId + windowTitleHash + textHash
browser_navigation: browserApp + normalizedUrl + titleHash
clipboard_change: contentHash
file_activity: rootId + relativePath + operation + contentHash
terminal_command: sessionId + commandIndex
```

## Protected Apps Strategy

Default protected app classes:

- Password managers.
- Keychain and credential tools.
- System Settings privacy/security panes.
- Banking/finance apps if detectable by bundle ID or user configuration.
- Private/incognito browser windows when detectable.
- Apps explicitly added by the user.

Initial default protected bundle IDs should include:

```text
com.apple.keychainaccess
com.apple.systempreferences
com.apple.systemsettings
com.1password.1password
com.agilebits.onepassword7
com.lastpass.LastPass
com.dashlane.dashlanephonefinal
com.bitwarden.desktop
```

Protected app behavior:

- Emit only `app_focus` with app name and protected flag.
- Do not emit window title, Accessibility text, clipboard text, screen/OCR/audio data.
- Mark summaries as redacted/protected.
- Exclude protected semantic payloads from Handoff and external AI.

Password field behavior:

- Accessibility nodes with secure/password roles are never captured.
- If a focused element or ancestor appears password-like, drop semantic payload for that snapshot.

## Privacy And Redaction Pipeline

Order:

1. Capture source observation.
2. Check protected app.
3. Drop forbidden fields.
4. Normalize source pointer.
5. Redact text fields.
6. Apply raw storage policy.
7. Create Event.
8. Ingest Event.
9. Audit source action and warnings.

Redaction patterns should reuse and extend the existing ingestion redaction policy. Observation
redaction should also handle:

- Query string tokens.
- Browser URLs with access tokens.
- One-time passcodes.
- SSH keys and private key blocks.
- `.env` style key-value pairs.
- Email addresses and phone numbers where source policy requires.

If redaction fails:

- Drop `content.text`.
- Drop raw references.
- Set `redactionState: "failed"`.
- Store only metadata needed for audit.
- Exclude from Handoff/export/AI by default.

## Queue And Scheduler

### Capture Queue

Use an in-process queue first.

Interface:

```ts
interface ObservationQueue {
  enqueue(input: ObservationInput): void;
  drain(maxItems?: number): Promise<ObservationDrainResult>;
  pause(): void;
  resume(): void;
  clear(): void;
}
```

Defaults:

- Max queued items: 1000.
- Drain batch size: 50.
- Drain interval: 2 seconds while collecting.
- Drop raw payload first under pressure.
- If still full, drop low-value duplicate metadata and log a warning.

### Semantic Scheduling

Do not run the full semantic pipeline for every single Event.

Initial scheduler:

- Ingest Events continuously.
- Rebuild Activity Sessions after a batch drain.
- Generate Knowledge drafts only when a session closes or user requests daily review.
- Generate Recommendations after batch drain if new todo/blocker-like Events were inserted.
- Generate Memory candidates only when Knowledge is confirmed.

Implementation can start by reusing existing `reindexLocalDataWithProvider` after batch drains, then
optimize into incremental builders once correctness is stable.

## Database And Migration Notes

Current tables store domain objects as JSON enough to add new source kinds/event types without a
schema migration if the TypeScript union changes and repositories remain generic.

Add migrations only if implementing:

- Observation runtime table.
- Protected-app table.
- Allowed-folder table.
- Queue persistence table.
- Observation sidecar metadata table.

Recommended first slice:

- Store observation settings in existing `settings`.
- Store sources in existing `sources`.
- Store Events in existing `events`.
- Avoid persistent queue until needed.

## IPC And CLI Contracts

Desktop preload API should expose:

```ts
getObservationStatus(): Promise<ObservationStatus>
startObservation(): Promise<DesktopSnapshot>
pauseObservation(): Promise<DesktopSnapshot>
resumeObservation(): Promise<DesktopSnapshot>
stopObservation(): Promise<DesktopSnapshot>
updateObservationSetting(key, value): Promise<DesktopSnapshot>
```

CLI diagnostics:

```text
orbit observe status --json
orbit observe permissions --json
orbit observe protected-apps --json
```

The CLI should read local state. It should not start OS-level capture unless a future command
explicitly opts into that behavior.

## Test Strategy

### Unit Tests

Required:

- Observation state transitions.
- Source pointer generation.
- Event normalization for each event type.
- Protected-app suppression.
- Redaction and raw storage policy.
- Deduplication keys.
- Queue overflow behavior.

### Adapter Tests

Required:

- Mock observation stream.
- Fixture observation stream.
- Cursor/idempotency.
- Malformed observation input warnings.
- Protected app fixtures.
- Clipboard hash-only policy.
- Filesystem allowlist behavior.

### Desktop Tests

Required:

- Runtime settings render.
- Start/pause/resume/stop actions update state.
- Permission-needed state renders.
- Protected apps can be listed/edited.
- Snapshot refresh works after observation state changes.

### E2E Smoke

Do not require real OS permissions in CI.

Use:

- `ORBIT_OBSERVATION_MOCK=1`
- synthetic observation events,
- packaged app smoke where possible.

Manual local smoke for real macOS Tier 1:

- Launch app.
- Enable observation.
- Switch between two benign apps.
- Verify app/window Events appear.
- Pause observation.
- Switch apps again.
- Verify no new Events while paused.
- Resume and verify Events continue.
- Open a protected app and verify semantic capture is suppressed.

## First Code Goal Cut

The first implementation goal should not attempt all of Goal 4. Use this smaller cut:

### Goal 4A: Mock Background Observation To Activity

Scope:

- Add observation source/event types.
- Add desktop observation fixtures.
- Add observation runtime state in settings.
- Add mock observer and queue.
- Ingest mock observation Events.
- Show observation status in CLI and desktop settings.
- Verify Events become Activity Sessions.

Acceptance:

```bash
pnpm test
pnpm typecheck
pnpm --filter @orbit/desktop test
pnpm --filter @orbit/cli orbit observe status --json
pnpm --filter @orbit/cli orbit activity list --json
```

### Goal 4B: Real Tier 1 App/Window Observer

Scope:

- Add real macOS app/window metadata observer.
- Keep native helper optional and narrow.
- Add protected-app suppression.
- Add menu bar start/pause/resume.
- Add manual smoke instructions.

Acceptance:

- All 4A commands pass.
- Manual macOS smoke verifies app focus Events.
- No raw screen/OCR/audio is captured.

### Goal 4C: Live Pipeline And Review

Scope:

- Batch-drain observer queue into Event ingestion.
- Re-index Activity after batches.
- Update Today and Handoff.
- Generate Recommendations from observed follow-ups where available.
- Keep Memory candidate creation gated by confirmed Knowledge.

Acceptance:

```bash
pnpm test
pnpm typecheck
pnpm --filter @orbit/cli orbit context today --json
pnpm --filter @orbit/cli orbit handoff today --json
```

### Goal 4D: Tier 2 Gates

Scope:

- Add Accessibility permission detection and mock snapshot adapter.
- Add explicit filesystem watch with allowlist.
- Add clipboard hash-only mode.
- Add browser/terminal metadata integration only through approved paths.

Acceptance:

- Permission-needed states work.
- Protected apps suppress semantic capture.
- Unsafe Events are excluded from Handoff.

## Open Decisions

These should be resolved during implementation spikes:

- Whether real Tier 1 requires a Swift helper or can be handled in Electron/Node.
- Exact packaged location and build system for a native helper.
- Whether observation queue needs persistence before Beta.
- Whether app/window title should require Accessibility from day one.
- Which protected bundle IDs should ship by default.
- Whether shell integration belongs in `packages/adapters` or a separate local source writer.

Until resolved, implementation should keep interfaces mockable and avoid committing core logic to a
single OS capture mechanism.

