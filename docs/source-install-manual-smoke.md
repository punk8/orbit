# Source Install Manual macOS Smoke

Run this checklist from a real macOS user account after building Orbit from source. The agent
environment cannot fully exercise Screen Recording permission UI, foreground protected windows, Low
Power Mode, or Gatekeeper prompts, so this file defines the local evidence a source-install user can
record.

Use a repo-local home:

```bash
export ORBIT_HOME="$PWD/.tmp/source-install-manual-smoke"
mkdir -p "$ORBIT_HOME"
```

## Evidence Format

Record evidence with `ORBIT_ALPHA_MANUAL_SMOKE` using comma-separated `scenario=status` pairs. Status
must be `passed`, `failed`, or `needs_data`.

```bash
ORBIT_ALPHA_MANUAL_SMOKE="screenRecordingPermission=passed,autoStart=passed,pauseResumeStop=passed,permissionRevoke=passed,restartAutoResume=passed,resourcePause=passed,protectedContext=passed,auditReview=passed,cleanup=passed,handoffExclusion=passed" \
  pnpm --filter @orbit/cli orbit perception release-gate --json
```

Release gate behavior:

- `pass`: every required scenario is recorded as `passed`.
- `fail`: any required scenario is recorded as `failed`.
- `needs_data`: no real evidence has been recorded, or one or more scenarios are still
  `needs_data`.

## Required Scenarios

### screenRecordingPermission

Build and start Orbit, grant macOS Screen Recording permission to the app being run, restart if macOS
requires it, then verify:

```bash
pnpm --filter @orbit/cli orbit perception status --json
```

Expected: permission is `granted`; raw screenshot storage remains disabled.

### autoStart

After Screen Recording is granted and the source is not paused, stopped, disabled, protected, or
resource-paused, verify the runtime automatically enters low-frequency observing.

Expected: menu bar, Settings, and CLI show observing or waiting for the next low-frequency burst.

### pauseResumeStop

Use visible controls to pause, resume, and stop observation.

Expected: each transition is visible, capture work is cancelled while paused/stopped, and audit logs
record the state change.

### permissionRevoke

Revoke Screen Recording permission in macOS System Settings while Orbit is running.

Expected: Orbit stops capture, enters permission-needed state, and writes audit without retaining raw
frame payloads.

### restartAutoResume

Quit and restart Orbit after a granted permission state. Also test after user pause/stop.

Expected: granted + not paused/stopped/disabled resumes low-frequency observing; user pause/stop is
preserved and does not auto-resume.

### resourcePause

Exercise at least one source-install resource pause condition such as Low Power Mode, low battery,
queue pressure, storage cap, or provider budget exhaustion.

Expected: capture pauses before new helper work, status explains the resource reason, and audit
records the pause.

### protectedContext

Bring a protected app/window/domain to the foreground, such as a password manager, Keychain/security
surface, private browser window, banking/payment/auth/OTP page, or secret-like terminal/config view.

Expected: protected context suppresses helper capture when metadata is available. If detected after
capture, OCR/indexing/Handoff/Knowledge/Recommendation drop protected content and audit only safe rule
IDs/reason codes/counts.

### auditReview

Run:

```bash
pnpm --filter @orbit/cli orbit perception audit-review --json
```

Expected: audit review distinguishes missing real data from missing implementation and lists next
actions for any uncovered operation groups.

### cleanup

Run a dry-run cleanup and then an explicit cleanup from the UI or CLI.

Expected: cleanup only deletes ledger/database-registered sidecars under `ORBIT_HOME`, preserves
derived Activity/Knowledge/Handoff summaries, and marks evidence unavailable where needed.

### handoffExclusion

Generate a Handoff Pack:

```bash
pnpm --filter @orbit/cli orbit handoff today --json
```

Expected: default Handoff excludes raw screenshot, thumbnail, raw OCR dump, audio, transcript,
failed-redaction data, protected evidence, draft Knowledge, and unconfirmed Memory while keeping safe
summaries and source pointers useful.
