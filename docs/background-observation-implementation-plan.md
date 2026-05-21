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

Build in four checkpoint-sized cuts:

1. **4A: Mock background observation to Activity**
   - Observation domain types.
   - Desktop observation fixtures.
   - Runtime state in settings.
   - Mock observer and in-process queue.
   - Mock Events ingested into Activity Sessions.
2. **4B: Real Tier 1 app/window observer**
   - Real macOS app focus capture.
   - Window title capture only when available without extra permission, otherwise mark as
     `needs_permission`.
   - Protected-app suppression.
   - Menu bar start/pause/resume.
3. **4C: Live pipeline and review integration**
   - Batch-drain into Event ingestion.
   - Activity/Today/Handoff refresh.
   - Knowledge/Recommendation scheduling.
   - Memory candidate creation remains gated by confirmed Knowledge.
4. **4D: Tier 2 gates**
   - Accessibility permission detector and mock snapshots.
   - Explicit filesystem allowlist.
   - Clipboard hash-only mode.
   - Browser/terminal metadata only through approved paths.

Do not implement Tier 3 screen/OCR/audio in these slices unless a later task explicitly adds the
stronger permission, protected-app, TTL, redaction, storage, audit, and smoke-test gates.

## Core Type Contracts

Use these interfaces as the implementation contract for Goal 4A. Names can be adjusted to match
local style, but field semantics should remain stable.

```ts
type ObservationTier = "tier1" | "tier2" | "tier3";

type ObservationRuntimeStatus =
  | "not_configured"
  | "needs_permission"
  | "ready"
  | "collecting"
  | "paused"
  | "warning"
  | "error"
  | "disabled";

type ObservationSourceKind =
  | "desktop"
  | "accessibility"
  | "browser"
  | "terminal"
  | "clipboard"
  | "filesystem"
  | "screen"
  | "audio";

type ObservationInputType =
  | "app_focus"
  | "window_focus"
  | "window_title_change"
  | "accessibility_snapshot"
  | "browser_navigation"
  | "terminal_command"
  | "terminal_output_summary"
  | "clipboard_change"
  | "file_activity"
  | "observation_state"
  | "permission_state";

interface ObservationInput {
  id?: string;
  type: ObservationInputType;
  tier: ObservationTier;
  sourceKind: ObservationSourceKind;
  occurredAt: string;
  observedAt?: string;
  runtimeSessionId: string;
  sequence: number;
  app?: {
    name: string;
    bundleId?: string;
    pid?: number;
    isProtected?: boolean;
  };
  window?: {
    title?: string;
    titleHash?: string;
    isPrivate?: boolean;
  };
  browser?: {
    url?: string;
    title?: string;
    profileId?: string;
  };
  terminal?: {
    sessionId: string;
    commandIndex: number;
    command?: string;
    cwd?: string;
    exitCode?: number;
  };
  clipboard?: {
    contentType: "text" | "image" | "file" | "url" | "unknown";
    contentHash: string;
    redactedSummary?: string;
  };
  file?: {
    rootId: string;
    relativePath: string;
    operation: "created" | "modified" | "deleted" | "renamed";
    contentHash?: string;
  };
  accessibility?: {
    role?: string;
    focusedElementRole?: string;
    text?: string;
    textHash?: string;
    containsSecureField?: boolean;
  };
  permission?: PermissionStatus;
  raw?: {
    text?: string;
    localRef?: string;
    sizeBytes?: number;
  };
}

interface ObservationDrainResult {
  read: number;
  inserted: number;
  skipped: number;
  dropped: number;
  warnings: string[];
  lastEventAt?: string;
}

interface ObservationStatus {
  status: ObservationRuntimeStatus;
  enabled: boolean;
  paused: boolean;
  activeRuntimeSessionId?: string;
  tiers: Record<ObservationTier, ObservationTierStatus>;
  permissions: PermissionStatus[];
  protectedApps: ProtectedAppRule[];
  allowedFolders: AllowedFolderRule[];
  lastStartedAt?: string;
  lastStoppedAt?: string;
  lastEventAt?: string;
  lastError?: string;
  queueDepth: number;
}

interface ObservationTierStatus {
  enabled: boolean;
  status: ObservationRuntimeStatus;
  sourceKinds: ObservationSourceKind[];
  lastEventAt?: string;
  lastError?: string;
}

interface PermissionStatus {
  kind: "accessibility" | "screen" | "microphone" | "filesystem" | "automation";
  requiredFor: ObservationSourceKind[];
  status: "not_required" | "not_determined" | "granted" | "denied" | "restricted" | "unknown";
  canRequestFromApp: boolean;
  instructions?: string;
}

interface ProtectedAppRule {
  id: string;
  match:
    | { kind: "bundle_id"; value: string }
    | { kind: "app_name"; value: string }
    | { kind: "window_title_pattern"; value: string };
  reason: "default_sensitive_app" | "user_added" | "private_window" | "password_field";
  enabled: boolean;
}

interface AllowedFolderRule {
  id: string;
  rootPath: string;
  displayName: string;
  project?: string;
  enabled: boolean;
  includeGlobs: string[];
  excludeGlobs: string[];
  defaultSensitivity: "public" | "internal" | "confidential" | "secret";
}
```

Implementation notes:

- `ObservationInput.raw` is transient. It must be dropped or converted to policy-allowed
  `Event.content.summary` before persistence.
- `runtimeSessionId` is created when observation starts and changes after a full stop/start.
- `sequence` is monotonic within `runtimeSessionId` and is used for source pointers.
- `PermissionStatus.status = denied` must not be treated as an error if lower tiers can still run.

## Mock Fixture Contract

Goal 4A should use deterministic fixture streams before real OS capture.

Recommended files:

```text
fixtures/desktop/day-1.jsonl
fixtures/desktop/protected-app.jsonl
fixtures/expected/desktop-events.json
fixtures/expected/desktop-activity-sessions.json
```

Each JSONL line is an `ObservationInput` with stable timestamps and sequence numbers.

Example:

```json
{"type":"app_focus","tier":"tier1","sourceKind":"desktop","occurredAt":"2026-05-21T09:00:00.000Z","runtimeSessionId":"obs-fixture-day-1","sequence":1,"app":{"name":"Terminal","bundleId":"com.apple.Terminal","pid":101}}
```

```json
{"type":"window_focus","tier":"tier1","sourceKind":"desktop","occurredAt":"2026-05-21T09:00:03.000Z","runtimeSessionId":"obs-fixture-day-1","sequence":2,"app":{"name":"Terminal","bundleId":"com.apple.Terminal","pid":101},"window":{"title":"orbit - zsh"}}
```

```json
{"type":"app_focus","tier":"tier1","sourceKind":"desktop","occurredAt":"2026-05-21T09:05:00.000Z","runtimeSessionId":"obs-fixture-protected","sequence":1,"app":{"name":"1Password","bundleId":"com.1password.1password","pid":202,"isProtected":true},"window":{"title":"Private vault"}}
```

Mock observer behavior:

- Reads JSONL from `fixtures/desktop/*.jsonl` or a test-provided path.
- Sorts by `occurredAt`, then `sequence`.
- Emits inputs into `ObservationQueue`.
- Respects pause/resume by not emitting while paused.
- Can be enabled by `ORBIT_OBSERVATION_MOCK=1`.
- Does not require OS permissions.

Expected protected-app result:

- The resulting Event keeps app name and protected indication.
- Window title is omitted or redacted.
- `content.summary` uses a protected-app placeholder.
- No raw text is stored.

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
- Use **Swift helper via stdio** for real frontmost app/window metadata in Goal 4B unless a quick
  spike proves a pure Electron/Node approach is reliable.
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
- Goal 4A does not include real macOS capture.
- Goal 4B starts with the Swift helper because Electron alone does not expose reliable frontmost app
  metadata across arbitrary macOS apps.

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

Every normalized observation Event must include these canonical fields:

| Field | Rule |
| --- | --- |
| `id` | Stable ID from adapter ID, source pointer, type, occurredAt, and dedup key. |
| `schemaVersion` | `1` until the core Event schema changes. |
| `source.kind` | One of `desktop`, `accessibility`, `browser`, `filesystem`, or the matching observation source kind. |
| `source.adapterId` | Stable configured source ID, usually `desktop_observation`. |
| `source.externalId` | Optional; use source-native ID only when stable. |
| `source.pointer` | Generated from the pointer schemes in this document. |
| `occurredAt` | Source observation timestamp. |
| `observedAt` | Ingestion timestamp; default to `occurredAt` for fixtures. |
| `context.app` | Required for app/window/accessibility/browser/clipboard observations when known. |
| `context.windowTitle` | Only when allowed, redacted, and not protected. |
| `context.url` | Only origin/path policy allows; strip query/fragment by default. |
| `type` | Matching Event type from the observation input. |
| `content.title` | Short user-readable label. |
| `content.summary` | Bounded, redacted summary. Required when raw text is dropped. |
| `content.text` | Only when source policy explicitly allows raw text. |
| `content.rawRef` | Only for policy-allowed sidecars; not used in Goal 4A. |
| `privacy.sensitivity` | `internal` for metadata, `confidential` for semantic text unless policy says otherwise. |
| `privacy.retentionPolicyId` | Source permission scope retention ID, default `default`. |
| `privacy.redactionState` | `none`, `redacted`, or `failed`. |
| `hash` | Deterministic hash of normalized source pointer, type, occurredAt, content summary/title, and context. |

If a field is blocked by protected-app or redaction policy, omit the field rather than storing a
placeholder that leaks sensitive detail.

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

Canonical pointer:

```text
desktop://app-focus/<runtimeSessionId>#<sequence>
```

Dedup key:

```text
app_focus:<bundleId-or-appName>
```

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

Canonical pointer:

```text
desktop://window/<runtimeSessionId>#<sequence>
```

Dedup key:

```text
window_focus:<bundleId-or-appName>:<redactedWindowTitleHash>
```

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

Canonical pointer:

```text
accessibility://snapshot/<runtimeSessionId>#<sequence>
```

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

Canonical pointer:

```text
browser://navigation/<profile-or-app>/<timestamp-or-sequence>
```

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

Canonical pointer:

```text
terminal://session/<sessionId>#<commandIndex>
```

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

Canonical pointer:

```text
clipboard://change/<runtimeSessionId>#<sequence>
```

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

Canonical pointer:

```text
filesystem://watch/<rootId>/<relativePath>#<eventId>
```

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

## Anti-Noise Thresholds

Background observation can produce many low-value focus Events. The first implementation should use
these thresholds to prevent noisy Activity, Knowledge, and Recommendations:

Activity Session creation:

- Create/keep a session for Tier 1-only data only when there are at least 2 Events spanning at least
  30 seconds, or when the session links to a higher-signal source such as command, file activity,
  Codex/local-agent, chat, meeting, or explicit user action.
- Merge isolated app focus changes under 30 seconds into neighboring sessions when app/project
  context matches.
- Do not create a separate session for a protected-app focus blip unless it lasts at least 5 minutes;
  even then, keep it metadata-only.

Knowledge generation:

- Do not generate Knowledge from Tier 1 app/window metadata alone unless the Activity Session lasts
  at least 10 minutes and includes at least one non-protected window title or source-backed summary.
- Prefer Today summary wording like "Observed work in Terminal and editor" for low-signal sessions.
- Generate detailed Knowledge only when the session includes semantic Events, explicit source Events,
  command/file changes, discussions, meetings, or user-triggered recap.

Recommendation generation:

- Do not generate Recommendations from app/window focus alone.
- Require todo/blocker/failed-test/repeated-workflow evidence or a user-visible stale follow-up.
- Suppress duplicate recommendations with the same type and evidence set until new evidence appears.

Memory generation:

- Never generate Memory directly from observation Events.
- Memory candidates only come from confirmed Knowledge or explicit user save.

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

## First Code Goal Cuts

The first implementation goal should not attempt all of Goal 4. Use these smaller cuts:

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
