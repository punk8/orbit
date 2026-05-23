# Alpha Dogfood Runtime And Native Helper Productionization Spec

## Purpose

This spec turns the completed Screen/OCR-first Activity redesign into a Yansu-like Alpha dogfood
runtime: after the user grants macOS Screen Recording permission, Orbit should quietly start
low-frequency Screen/OCR observation in the background, keep a visible runtime state, and continue
the existing local-first pipeline:

```text
Screen/OCR Runtime
  -> Source Adapter
  -> Event
  -> Activity Session
  -> Knowledge Artifact
  -> Memory
  -> Recommendation
  -> Handoff / Agent Interface
```

The target is not a screenshot search archive and not silent surveillance. The target is an
installable local Alpha that starts observing once Screen Recording permission exists, suppresses
protected contexts before capture, stores summaries and source pointers by default, and lets the
user pause, stop, delete, and audit what happened.

## Current Baseline

The previous checkpoint completed `docs/screen-ocr-first-activity-redesign-spec.md` Goals A-G:

- Screen/OCR control plane and policy storage.
- Native and mock Screen/OCR helper boundaries.
- Apple Vision/local OCR path with Chinese and English recognition.
- OCR redaction and duplicate suppression.
- Activity frame index and playback UI.
- session boundary and quality engine.
- Knowledge, Memory, Recommendation, and Handoff integration.
- Alpha resource budgets, cleanup ledger, audit review, package smoke, and release gate.

This spec starts from commit:

```text
eec1a20 feat: harden alpha perception release gates
```

## Product Policy

### Yansu-like Auto-start

Screen/OCR observation should start automatically whenever macOS Screen Recording permission is
`granted`, unless the user has explicitly paused, stopped, disabled, or selected a protected context
that must suppress capture.

Orbit must not require an additional in-app enable confirmation after permission is granted.
Granting Screen Recording permission is treated as the user's enable intent for Alpha dogfood
Screen/OCR observation.

Required behavior:

- First launch with missing permission shows permission onboarding and runtime state
  `needs_permission`.
- When permission changes to `granted`, Orbit automatically transitions to `observing`.
- On app restart, if permission remains `granted` and the user has not paused/stopped/disabled,
  Orbit automatically resumes observation.
- If permission is revoked, Orbit transitions to `needs_permission`, stops capture, and writes an
  audit event.
- If the user pauses or disables observation, Orbit must not auto-resume until the user resumes or
  clears the disabled state.

### Low-friction, Not Invisible

The user should not have to manage a capture workflow. Orbit should run quietly after permission is
granted. However, the state must remain visible and controllable:

- menu bar and Settings show `Observing`, `Paused`, `Permission needed`, `Protected`, or `Error`;
- pause, resume, stop/disable, delete raw sidecars, and clear local data remain available;
- protected app/window/domain suppression happens before capture;
- raw screenshots are not stored by default;
- Handoff does not export raw screenshots, raw OCR dumps, audio, or private payloads by default.

### What "Background Observation" Means In This Alpha

This Alpha should implement low-frequency Screen/OCR bursts, not continuous raw video recording.

Default dogfood runtime:

- uses the conservative sampling preset unless the user changes it;
- captures bounded bursts using the native helper;
- runs only while the app or background service is alive;
- pauses under resource budget, low battery, low power, protected context, or permission failure;
- records audit events for start, stop, pause, resume, permission changes, protected skips, errors,
  cleanup, and Handoff export decisions.

## Non-goals

- Continuous raw screen recording.
- Default microphone, system audio, browser scraping, keystroke capture, or arbitrary filesystem
  scanning.
- Uploading raw/private payloads to external AI.
- External side-effect automation.
- Full general-availability distribution, auto-update, notarized release, or broad-user support.
- Replacing Activity/Knowledge/Memory with screenshot search.

## Runtime States

Use a small explicit state machine for Screen/OCR runtime:

- `needs_permission`: Screen Recording permission is missing or revoked.
- `observing`: permission is granted and the runtime is scheduling/capturing low-frequency bursts.
- `paused_user`: user paused.
- `paused_resource`: low battery, low power, queue, storage, or provider budget pause.
- `protected`: foreground app/window/domain is protected and capture is suppressed.
- `stopped`: user disabled Screen/OCR observation.
- `error`: helper/runtime failure needs attention.

Transitions must be explainable and audited. The user-facing labels must live in the i18n/locale
layer with English and Chinese strings.

## Native Helper Requirements

The helper should move from an explicit script-like prototype toward an Alpha-packaged helper
boundary.

Required properties:

- packaged with the desktop app or discoverable through a stable app-relative path;
- smoke-tested in packaged app mode;
- reports structured JSON for success, permission failure, protected skip, unsupported macOS, and
  OCR failure;
- uses ScreenCaptureKit for frames and Apple Vision for local OCR;
- supports English and Chinese recognition;
- does not persist raw images by itself;
- returns only frame metadata, hashes, OCR text, confidence, language metadata, app/window metadata,
  and warnings;
- respects helper timeout and cancellation from the runtime.

If signing/notarization cannot be completed locally, the implementation must document the exact
blocker and keep the mock/helper smoke path passing.

## Desktop Experience

### Onboarding

First-run flow should be short:

1. Explain that Orbit uses local low-frequency Screen/OCR observation to build Activity and
   Knowledge.
2. Explain that raw screenshots are off by default and protected apps are skipped.
3. Show a single primary action to open/request macOS Screen Recording permission.
4. After permission is granted, automatically start observation.

There should be no second in-app confirmation after the OS permission is granted.

### Menu Bar / Tray

The app should expose a visible always-available state:

- current runtime state;
- pause/resume;
- stop/disable;
- capture one burst now;
- open Activity;
- open Settings;
- privacy cleanup.

### Settings

Settings should expose:

- runtime state and last transition reason;
- Screen Recording permission state;
- sampling preset;
- protected apps/windows/domains;
- raw retention policy;
- resource pause reasons;
- audit review;
- release gate summary;
- cleanup actions.

All visible copy must be i18n-backed and support Chinese.

## Data Flow

The existing pipeline remains authoritative:

```text
Permission Watcher
  -> Runtime State Machine
  -> Burst Scheduler
  -> Protected Context Guard
  -> Native Helper
  -> Screen/OCR Source Adapters
  -> Event Store
  -> Activity Session Builder
  -> Knowledge Draft Scheduler
  -> Memory Review
  -> Recommendation
  -> Handoff / Agent Interface
```

Rules:

- protected context guard runs before helper capture;
- helper result becomes `screen_observation` and `ocr_text` Events;
- OCR text is redacted before indexing, Knowledge input, Recommendation input, or Handoff;
- low-quality Activity remains visible but does not auto-generate Knowledge;
- confirmed Knowledge is required before Memory creation;
- Handoff exports only summaries, source pointers, and exclusion explanations.

## Audit Requirements

The audit log should support a user and developer reviewing what the Alpha did.

Required operations:

- permission checked;
- permission granted;
- permission revoked;
- runtime auto-started;
- runtime paused by user;
- runtime resumed by user;
- runtime paused by resource policy;
- runtime stopped/disabled;
- burst scheduled;
- burst started;
- burst skipped due to protected context;
- burst failed;
- burst completed;
- redaction failure;
- sidecar cleanup;
- Knowledge generated or suppressed due to quality;
- Handoff included/excluded source.

Audit review UI and CLI should report coverage by operation group.

## Checkpoints

Each checkpoint is an independent commit and push after acceptance passes. Do not mix later goals
into earlier commits. If a checkpoint hits a true macOS permission, signing, helper packaging, or
system API blocker, document the blocker with:

- what the blocker is;
- which code was completed;
- which substitute verification ran;
- remaining risk;
- whether it is safe to proceed to the next checkpoint.

### Goal H: Permission Auto-start Runtime

Deliver:

- Screen/OCR runtime state machine;
- permission watcher or polling bridge;
- auto-start when Screen Recording permission is `granted`;
- auto-resume on app restart when permission remains `granted`;
- no extra in-app enable confirmation after OS permission is granted;
- user pause/stop/disable state that prevents auto-resume;
- permission revoke handling;
- runtime transition audit events;
- CLI status showing state, reason, permission, and next action.

Acceptance:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/cli orbit perception status --json
pnpm --filter @orbit/cli orbit perception release-gate --json
```

### Goal I: Background Burst Scheduler

Deliver:

- low-frequency burst scheduler using existing sampling presets;
- resource budget checks before scheduling and before capture;
- protected context guard before helper invocation;
- cancellation on pause/stop/permission revoke;
- burst audit for schedule/start/skip/fail/end;
- clean separation between scheduler, helper, adapters, and pipeline trigger;
- mock scheduler tests that do not capture real frames.

Acceptance:

```bash
pnpm test
pnpm typecheck
pnpm --filter @orbit/adapters test
pnpm --filter @orbit/cli orbit perception screen capture-now --mock --json
pnpm --filter @orbit/cli orbit perception audit-review --json
```

### Goal J: Desktop Onboarding And Menu Bar Runtime UX

Deliver:

- first-run Screen/OCR onboarding;
- permission-needed screen/state;
- automatic transition to observing after permission grant;
- menu bar state and controls;
- Settings runtime state card;
- pause/resume/stop/disable controls wired to runtime state;
- capture-one-burst-now action;
- all new visible copy in i18n with Chinese support;
- no nested cards or marketing-style landing page.

Acceptance:

```bash
pnpm test
pnpm typecheck
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
```

### Goal K: Packaged Native Helper Alpha Path

Deliver:

- app-relative packaged helper path;
- packaged helper smoke in `package:smoke`;
- structured helper error mapping for permission denied, unsupported macOS, timeout, OCR failure,
  and unknown failure;
- native helper mode in release gate;
- no raw image persistence by helper;
- package scan for fixtures, tmp data, sidecars, and private marker strings;
- documented signing/notarization status and blocker if credentials are unavailable.

Acceptance:

```bash
pnpm test
pnpm typecheck
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop package:dir
pnpm --filter @orbit/desktop package:smoke
pnpm --filter @orbit/cli orbit perception release-gate --json
```

### Goal L: Dogfood Observation To Activity Quality Loop

Deliver:

- background burst output flows into Event ingestion automatically;
- pipeline trigger after burst completion;
- Activity Session updates visible without manual reindex;
- quality score and close reason shown in Activity;
- low-quality suppression from Knowledge preserved;
- Chinese Knowledge drafts generated for acceptable sessions;
- Recommendation generation from visible errors, follow-ups, and context gaps;
- Handoff remains summary/source-pointer only.

Acceptance:

```bash
pnpm test
pnpm typecheck
pnpm --filter @orbit/cli orbit activity list --json
pnpm --filter @orbit/cli orbit context today --json
pnpm --filter @orbit/cli orbit handoff today --json
pnpm --filter @orbit/desktop test:e2e
```

### Goal M: Alpha Dogfood Hardening And Manual Smoke

Deliver:

- manual macOS dogfood checklist for permission grant, auto-start, pause, resume, stop, revoke, and
  restart auto-resume;
- resource pause smoke checklist;
- protected app/window/domain smoke checklist;
- audit review checklist with expected operation groups;
- cleanup checklist proving raw sidecars are absent or removed;
- release limitations updated for Yansu-like auto-start policy;
- final release gate includes auto-start policy, packaged helper mode, private-data scan, audit
  coverage, and manual smoke status.

Acceptance:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop package:smoke
pnpm --filter @orbit/desktop test:e2e
pnpm --filter @orbit/cli orbit perception release-gate --json
```

## Final Full Acceptance

After Goal M is committed and pushed, run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop package:smoke
pnpm --filter @orbit/desktop test:e2e
pnpm --filter @orbit/cli orbit perception release-gate --json
```

If `package:smoke` needs a packaged app and none exists, run
`pnpm --filter @orbit/desktop package:dir` before `package:smoke` and mention that setup step in
the result.

## Open Risks

- macOS Screen Recording permission prompts and permission revocation require manual verification
  on a real macOS user account.
- Signing and notarization may require unavailable Apple Developer credentials.
- ScreenCaptureKit behavior varies by macOS version and protected content source.
- Real dogfood data is needed to tune capture intervals, Activity quality thresholds, and
  Recommendation precision.
- A background runtime can create user trust risk if the visible state, pause/stop/delete controls,
  protected suppression, and audit review regress.
