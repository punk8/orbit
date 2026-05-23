# Source Install Dogfood Production Spec

## Purpose

This spec defines the path from the current Alpha dogfood runtime to a source-install dogfood product
that trusted users can clone, build, install, and run locally.

This is not a public distribution release. It intentionally excludes notarized public distribution,
auto-update, payment, account systems, cloud sync, and broad customer support. It is still a
production-minded customer-facing product path: the app observes sensitive work context, so it must be
visible, controllable, deletable, auditable, and resilient during real daily use.

## Target User And Install Model

Target user:

- trusted technical user or internal dogfood user,
- comfortable cloning a repository and running `pnpm`,
- willing to grant macOS Screen Recording permission,
- expects local-first behavior and clear privacy boundaries,
- expects the app to keep working across normal restarts and day-long work sessions.

Install model:

- user clones the repository,
- user runs source install/build commands,
- user starts the Electron desktop app locally or from a packaged app built from source,
- user can run CLI release gates and smoke commands locally,
- build artifacts remain local to the user machine.

## Non-Goals

- Public website download flow.
- App Store distribution.
- Notarized public release as a hard requirement.
- Auto-update.
- Cloud sync.
- Billing, accounts, team admin, or hosted backend.
- Broad customer support and telemetry backend.
- Default microphone, system audio, browser scraping, arbitrary filesystem scanning, or keystroke
  capture.
- Default raw screenshot or raw OCR dump retention.

## Product Completion Definition

The source-install dogfood product is complete only when a trusted user can:

1. Clone and build Orbit from documented commands.
2. Start the desktop app and understand what will be observed before granting permissions.
3. Grant macOS Screen Recording permission and see Orbit automatically enter low-frequency Screen/OCR
   observing.
4. Pause, resume, stop, disable, delete, and inspect Screen/OCR observation from visible UI and CLI.
5. Work normally for a day while Orbit creates Activity, Knowledge, Recommendation, and Handoff
   outputs without raw/private leakage.
6. Review what was captured, skipped, stored, cleaned, and exported.
7. Delete raw sidecars and source-derived data without corrupting derived summaries.
8. Generate a Handoff Pack that can warm-start another Agent without raw screenshots, raw OCR dumps,
   audio, transcripts, failed-redaction data, protected evidence, draft Knowledge, or unconfirmed
   Memory.
9. Run a local release gate that fails on real safety/build regressions and uses `needs_data` only for
   genuine unavailable manual evidence.

## Current Baseline

Existing baseline:

- pnpm TypeScript monorepo.
- Electron desktop app.
- SQLite local store.
- CLI release gate and perception commands.
- Screen/OCR permission auto-start runtime.
- Background burst scheduler.
- Packaged native helper Alpha path.
- Activity quality loop and Handoff exclusion path.
- i18n-backed runtime UI strings.
- Alpha release checklist and limitations.

Known remaining gaps:

- no source-install dogfood guide,
- no one-command source install verification path,
- real macOS manual smoke still not recorded,
- release gate still allows manual smoke and audit groups to remain `needs_data`,
- protected context defaults need production-minded expansion and review,
- audit/cleanup visibility is still too developer-oriented,
- dogfood Activity/Knowledge/Handoff quality has not been tuned on real workday data,
- long-running runtime recovery and user-facing failure states need hardening.

## Source Install User Journey

1. User opens repository README/docs and follows a source install guide.
2. User runs dependency, test, build, package, and release gate commands.
3. User starts Orbit.
4. First-run UI explains:
   - Screen/OCR observes low-frequency work context after macOS permission,
   - raw screenshots are off by default,
   - OCR runs locally,
   - protected contexts are skipped,
   - Handoff excludes raw/private payloads,
   - user can pause, stop, delete, and audit.
5. User grants Screen Recording permission.
6. Orbit automatically observes unless paused/stopped/disabled/protected/resource-paused.
7. User checks menu bar/Settings state during work.
8. User opens Activity and sees real sessions with quality, close reason, frame/OCR counts, privacy
   markers, and evidence links.
9. User opens Knowledge and reviews generated Chinese-capable summaries.
10. User opens Handoff and exports a safe summary/source-pointer context pack.
11. User runs audit/cleanup and can verify no raw sidecar leakage.

## Required Checkpoints

Each checkpoint must be an independent commit and push. Do not mix later checkpoint scope into earlier
commits. Prefer TDD: write or update failing tests before implementation where practical.

If a checkpoint hits a true macOS permission, native helper, signing, packaging, or system API
blocker, document:

- blocker,
- completed code,
- substitute verification,
- remaining risk,
- whether it is safe to continue to the next checkpoint.

### Goal N: Source Install And Local Verification Path

Deliver:

- `docs/source-install-dogfood-production-spec.md` remains the execution authority for this work.
- Source install guide for trusted users.
- Exact commands for dependency install, tests, build, packaged app build, package smoke, CLI release
  gate, and native rebuild recovery.
- Environment requirements: macOS version expectation, Node version, pnpm version, Xcode Command Line
  Tools, Screen Recording permission, and `ORBIT_HOME` usage.
- Local troubleshooting section for native module ABI mismatch, killed native rebuild lock, missing
  Screen Recording permission, packaged helper missing, SQLite lock, and stale `ORBIT_HOME`.
- A `source-install:verify` script or documented equivalent that runs the safe non-interactive gate.
- README/docs navigation to the source install guide.

Acceptance:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop package:dir
pnpm --filter @orbit/desktop package:smoke
ORBIT_HOME="$PWD/.tmp/source-install-release-gate" pnpm --filter @orbit/cli orbit perception release-gate --json
```

### Goal O: Manual macOS Smoke Evidence And Release Gate Tightening

Deliver:

- A manual smoke checklist that can be executed by a source-install user on a real macOS account.
- CLI support to record manual smoke evidence locally, or a documented `ORBIT_ALPHA_MANUAL_SMOKE`
  format that is easy to produce and validate.
- Release gate reports manual smoke as:
  - `pass` when all required smoke evidence is present,
  - `fail` when evidence explicitly records a failed required check,
  - `needs_data` only when no real manual smoke evidence has been recorded.
- Release gate distinguishes missing audit data from missing audit implementation.
- Release gate output includes clear next actions for source-install users.
- Manual smoke covers Screen Recording grant, auto-start, pause, resume, stop, permission revoke,
  restart auto-resume, resource pause, protected context, audit review, cleanup, and Handoff
  exclusion.

Acceptance:

```bash
pnpm test
pnpm typecheck
pnpm --filter @orbit/cli orbit perception release-gate --json
ORBIT_ALPHA_MANUAL_SMOKE="screenRecordingPermission=passed,autoStart=passed,pauseResumeStop=passed,permissionRevoke=passed,restartAutoResume=passed,resourcePause=passed,protectedContext=passed,auditReview=passed,cleanup=passed,handoffExclusion=passed" pnpm --filter @orbit/cli orbit perception release-gate --json
```

Manual acceptance on a real macOS source-install account must be documented separately if it cannot be
run inside the current agent environment.

### Goal P: Protected Context Rule Pack And User Controls

Deliver:

- Expanded built-in protected context defaults:
  - password managers,
  - Keychain/system security surfaces,
  - private browser windows,
  - banking/payment/auth/OTP title and domain patterns,
  - secret-like terminal/config indicators.
- User-configurable protected app/window/domain rules in Settings and CLI.
- "Ignore current app/window" action from menu bar or Settings when app/window metadata is available.
- Protected suppression still happens before helper capture when foreground metadata is available.
- If protection is detected after capture, OCR/indexing/Handoff/Knowledge/Recommendation must drop
  protected content and write audit.
- Audit shows protected rule ID, reason code, and safe counts, with no protected title text or OCR
  payload leakage.

Acceptance:

```bash
pnpm test
pnpm typecheck
pnpm --filter @orbit/adapters test
pnpm --filter @orbit/desktop test
pnpm --filter @orbit/cli orbit perception status --json
pnpm --filter @orbit/cli orbit perception audit-review --json
```

### Goal Q: Audit, Cleanup, And Deletion UX

Deliver:

- Desktop-visible audit review for:
  - permission,
  - runtime,
  - burst scheduler,
  - protected skip,
  - resource pause,
  - redaction failure,
  - cleanup,
  - Knowledge generated/suppressed,
  - Handoff included/excluded.
- Desktop-visible cleanup controls:
  - dry-run raw sidecar cleanup,
  - execute raw sidecar cleanup,
  - disable source and delete raw sidecars,
  - delete source-derived Events for a time range or source,
  - preserve derived Knowledge/Handoff summaries with evidence-unavailable state.
- CLI mirrors desktop actions and produces JSON suitable for audit.
- Cleanup deletes only ledger/database-registered sidecars under `ORBIT_HOME`.
- Delete operations update FTS/vector/cache/read models or clearly mark them rebuild-required.
- All destructive actions require confirmation in UI and explicit flags in CLI.

Acceptance:

```bash
pnpm test
pnpm typecheck
pnpm --filter @orbit/db test
pnpm --filter @orbit/privacy test
pnpm --filter @orbit/desktop test:e2e
pnpm --filter @orbit/cli orbit perception cleanup --dry-run --json
pnpm --filter @orbit/cli orbit perception audit-review --json
```

### Goal R: Real Dogfood Activity, Knowledge, Recommendation, And Handoff Quality Loop

Deliver:

- Realistic source-install dogfood fixture pack with sanitized multi-hour Screen/OCR-like workday
  data.
- Activity boundary and quality thresholds tuned against the fixture pack.
- Knowledge draft quality checks for Chinese and English summaries.
- Recommendation generation quality checks for visible errors, follow-ups, missing verification, and
  context gaps.
- Handoff preview verifies summaries and source pointers are useful while raw/private payloads remain
  excluded.
- Low-quality Activity remains visible but does not auto-generate Knowledge.
- Quality metrics are surfaced in CLI release gate or a dedicated quality command.

Acceptance:

```bash
pnpm test
pnpm typecheck
pnpm --filter @orbit/cli orbit pipeline run --json
pnpm --filter @orbit/cli orbit activity list --json
pnpm --filter @orbit/cli orbit context today --json
pnpm --filter @orbit/cli orbit handoff today --json
pnpm --filter @orbit/desktop test:e2e
```

### Goal S: Source-Install Runtime Hardening And Final Gate

Deliver:

- Runtime failure state mapping for:
  - helper missing,
  - helper timeout,
  - permission missing/revoked,
  - protected context,
  - resource paused,
  - SQLite lock/migration failure,
  - native ABI mismatch,
  - storage cap reached.
- Menu bar, Settings, CLI, and release gate show clear status and next action.
- Restart recovery preserves user pause/stop/disable state.
- Queue cancellation on pause/stop/revoke is verified.
- Source-install release gate is the single final local readiness command.
- Documentation states exactly what is not covered by source-install dogfood: public notarized
  distribution, auto-update, cloud sync, hosted support, and broad telemetry.

Final acceptance:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop package:dir
pnpm --filter @orbit/desktop package:smoke
pnpm --filter @orbit/desktop test:e2e
ORBIT_HOME="$PWD/.tmp/source-install-final-gate" pnpm --filter @orbit/cli orbit perception release-gate --json
```

If real macOS permission UI cannot be exercised in the agent environment, the final result must
include manual smoke evidence or an explicit blocker note with substitute verification.

## Implementation Rules

- Do not use `/tmp/orbit-dogfood-clean`.
- Use repo-local `ORBIT_HOME="$PWD/.tmp/..."` for acceptance and smoke commands.
- Do not delete or rewrite unrelated user changes.
- Do not enable continuous raw recording, microphone, system audio, arbitrary filesystem scanning,
  browser scraping, or keystroke capture by default.
- Do not upload raw/private payload to external AI by default.
- Do not export raw screenshots, raw OCR dumps, audio, transcripts, failed-redaction data, protected
  evidence, draft Knowledge, or unconfirmed Memory in default Handoff.
- User-visible copy must be i18n-backed and include Chinese.
- Every checkpoint must run its acceptance commands before commit/push.
- If existing code already covers a requirement, verify it and fill only the gap.

## Final Source-Install Dogfood Exit Criteria

- Source install guide is accurate from a clean clone.
- Safe non-interactive release gate passes.
- Manual macOS smoke is either recorded as pass or blocked with exact environment reason.
- Protected context defaults and user controls are usable.
- Audit and cleanup are understandable to a technical trusted user.
- Activity, Knowledge, Recommendation, and Handoff produce useful output from realistic dogfood data.
- Runtime failures are visible and recoverable.
- No default raw/private payload leakage path exists.
