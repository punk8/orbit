# Alpha Dogfood Manual Smoke

Use this checklist on a real macOS dogfood account before sharing an Alpha build. Keep
`ORBIT_HOME` pointed at a disposable local profile and do not use private production data.

## Screen Recording Permission And Auto-start

- Fresh launch with Screen Recording not granted shows `needs_permission` in Settings and the menu
  bar.
- Grant macOS Screen Recording permission, relaunch if macOS asks for it, and verify Screen/OCR
  transitions to `observing` without a second in-app enable confirmation.
- Quit and reopen Orbit while permission remains granted; if Screen/OCR was not paused, stopped, or
  disabled, verify it auto-resumes `observing`.
- Revoke Screen Recording permission in System Settings, return to Orbit, and verify capture stops,
  state becomes `needs_permission`, and audit includes permission revoke/runtime stop entries.

## Runtime Controls

- Pause Screen/OCR from the menu bar; verify state becomes `paused_user` and no burst captures run.
- Resume Screen/OCR; verify state returns to `observing`.
- Stop/disable Screen/OCR; quit and reopen Orbit; verify it stays `stopped` until explicitly
  resumed.
- Run one manual burst after resuming; verify Activity updates without running a separate reindex
  command.

## Resource Pause Smoke

- Enable Low Power Mode or simulate the resource policy path available to the test account.
- Verify Screen/OCR enters `paused_resource`, writes an audit entry, and does not capture frames
  while paused.
- Clear the resource condition and verify Screen/OCR can resume only through the normal runtime
  path.

## Protected Context Smoke

- Open a protected app such as a password manager or a window matching a protected title/domain
  rule.
- Verify capture is suppressed before the helper runs, no raw screenshot is stored, and audit
  records a protected skip.
- Leave the protected context and verify ordinary Screen/OCR observation can continue.

## Audit, Cleanup, And Handoff

- Run `orbit perception audit-review --json` and verify operation groups show permission,
  runtime, burst scheduler, skip/failure, cleanup, and Handoff activity after smoke.
- Run `orbit perception cleanup --json`; verify raw sidecars are absent or removed while Activity,
  Knowledge, Memory, Recommendation, and Handoff summaries remain usable.
- Generate `orbit handoff today --json`; verify it includes only summaries/source pointers and does
  not include raw screenshots, raw OCR dumps, audio, or private payloads.
- Run `orbit perception release-gate --json`; record any `manualSmoke.missing`, unsigned helper,
  signing/notarization, or audit `needs_data` items before sharing the Alpha build.
