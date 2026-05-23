# Alpha Release Limitations

Orbit Alpha is a local-first dogfood build for trusted users. It is not a general-distribution
release.

## Perception Defaults

- Screen/OCR, vision, microphone, system audio, and transcript sources are disabled by default.
- Raw screenshots, raw OCR dumps, audio, and transcript sidecars are not exported to Handoff by
  default.
- Raw sidecars, when explicitly enabled, are short-TTL data and must be cleaned before packaging or
  sharing a dogfood profile.
- Low Power Mode, low battery, queue pressure, storage caps, and provider budget exhaustion should
  pause capture instead of silently collecting more data.

## Packaging

- Alpha app artifacts are unsigned and not notarized unless signing credentials are explicitly
  supplied.
- The packaged smoke path scans for `.tmp`, fixture, perception sidecar, and common private marker
  leakage before launch.
- The Screen/OCR helper is packaged in the Alpha app resources and smoke-tested before launch.
- Packaged helper mode is `unsigned` until Apple Developer signing and notarization credentials are
  supplied; the release gate reports this as `needs_data`, not as a silent pass.

## Manual Smoke Requirements

- Verify macOS Screen Recording permission prompts on a clean account.
- Verify protected app suppression before capture and no retained raw sidecar after suppression.
- Verify pause, resume, stop, cleanup, Handoff exclusion, and audit review outputs.
- Record any `needs_data` release-gate audit groups before sharing an Alpha build.

## Known Gaps

- External AI providers remain opt-in and are not enabled by default.
- Browser scraping, keystroke capture, arbitrary filesystem scanning, and default microphone capture
  are out of scope.
- Signing, notarization, auto-update, and broad-user support flows are later release gates.
