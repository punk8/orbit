# Alpha Release Checklist

Orbit Alpha packaging is intentionally local-first and unsigned unless signing credentials are explicitly provided.

## Required Gates

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm --filter @orbit/desktop build`
- `pnpm --filter @orbit/desktop package:dir`
- `pnpm --filter @orbit/desktop test:e2e`
- `pnpm --filter @orbit/desktop package:dmg`
- `pnpm --filter @orbit/cli orbit perception status --json`
- `pnpm --filter @orbit/cli orbit perception cleanup --dry-run --json`
- `pnpm --filter @orbit/cli orbit perception release-gate --json`

## Artifact Policy

- Alpha artifacts are built under `apps/desktop/release`.
- `.tmp` private samples and fixture directories must not be packaged.
- The DMG target is configured for local Alpha distribution.
- Current Alpha artifacts are unsigned and not notarized: `identity: null`, `dmg.sign: false`.
- Packaging rebuilds native modules for Electron. If Node/Vitest later reports a `better-sqlite3` ABI mismatch, run `pnpm rebuild better-sqlite3` before continuing development tests.
- Perception controls must be usable in the packaged app with every high-risk source disabled by
  default.
- `.tmp`, private samples, fixture directories, and raw perception sidecars must not be packaged.

## Goal 8F Perception Release Gate

Before shipping an Alpha build with perception controls:

- Confirm `orbit perception status --json` shows all screen/OCR/vision/audio/transcript sources
  disabled and all provider routes disabled.
- Confirm raw sidecar storage is off by default; if a user enables it, the source must have a short
  `rawRetentionTtlMinutes` and `deleteRawOnDisable`.
- Run `orbit perception cleanup --dry-run --json` and then a non-dry cleanup on the dogfood profile
  before packaging.
- Run `orbit perception release-gate --json` and review any `needs_data` audit groups after manual
  smoke tests.
- Generate a Handoff Pack and verify it excludes raw media, failed-redaction Events, secret content,
  and non-exportable perception sources.

## Resource Budgets

Initial Alpha budgets are intentionally conservative until dogfood data exists:

- CPU: max 10% capture duty cycle, minimum 30s screen interval, max 6 OCR frames/minute.
- Battery: pause on Low Power Mode and pause below 20%.
- Storage: max 250 MB raw sidecars, default 60 minute raw TTL, cleanup every 15 minutes.
- Queue: max 1000 queued observations, drain batches of 25, drop raw payloads before dropping
  Events.
- Provider: max 60 provider requests/hour, 4000 input chars/request, 100k tokens/hour, no external
  provider by default.

## Manual macOS Permission Smoke

Run these on a clean macOS Alpha account before external dogfood:

- Fresh install: open Settings/Sources and verify no screen, OCR, vision, microphone, system audio,
  or transcript source starts collecting.
- Screen Recording: enable screen/OCR, grant permission, run the mock smoke, pause, resume, stop,
  then disable and run sidecar cleanup.
- Microphone: enable microphone/transcript with a mock/local provider, verify permission copy,
  protected app suppression, pause, stop, and cleanup.
- Protected apps: open a protected app/window and verify perception warnings are audited and no raw
  sidecar is retained.
- Delete: delete or disable a perception source and verify raw sidecars are removed while Activity,
  Knowledge, Recommendation, and Handoff summaries remain usable.

## Signing And Notarization Gate

Before broader distribution:

- Provide Apple Developer Team ID and signing certificate.
- Enable hardened runtime.
- Add notarization credentials through CI secrets or local keychain.
- Verify Gatekeeper behavior on a clean macOS user account.
- Update this checklist with the final signed artifact command.

## Known Alpha Limitations

- Perception fixture ingestion uses mock providers and sanitized fixtures only.
- Real raw screen recording, OCR, microphone, system audio, and browser scraping remain opt-in and
  disabled by default.
- No signed standalone native perception helper is shipped in this checkpoint. The existing Tier 1
  macOS observer source is a development helper and is not silently trusted as a packaged helper.
