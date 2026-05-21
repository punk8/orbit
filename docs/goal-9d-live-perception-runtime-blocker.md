# Goal 9D Live Perception Runtime Blocker

Last updated: 2026-05-21

## Status

Goal 9D is blocked. Do not continue to Goal 9E or Goal 9F until this blocker is resolved and the
Goal 9D acceptance smoke passes on macOS.

Goal 9A, 9B, and 9C completed the provider registry, real transcription provider path, and real
vision image input path. They intentionally still depend on explicit fixture or bounded sidecar
inputs. Goal 9D is the first checkpoint that requires live opt-in desktop perception sources, and
the repository does not yet contain a production-capable native capture runtime for that boundary.

## Blocking Findings

- `apps/desktop/native/macos-observer/README.md` defines the current helper as Tier 1 only:
  frontmost app changes and best-effort window titles over local stdio JSON lines. It explicitly
  excludes screen, OCR, audio, clipboard, Accessibility traversal, and keystroke APIs.
- `apps/desktop/native/macos-observer/Sources/main.swift` imports `AppKit`, `CoreGraphics`, and
  `Foundation` and emits only `frontmost_app_changed` payloads. It has no ScreenCaptureKit stream,
  Apple Vision OCR request, AVFoundation microphone path, audio chunker, or sidecar cleanup
  protocol.
- `apps/desktop/electron/observation/tier1MacObserver.ts` maps helper output only to `app_focus`
  and `window_focus` `ObservationInput` records.
- `apps/desktop/electron/observation/observationService.ts` starts only `Tier1MacObserver` and
  drains only Tier 1 desktop metadata. It has no live screen/OCR/audio session manager, no
  perception processing queue, and no stop/delete guard for delayed OCR/transcription/model jobs.
- `packages/adapters/src/screen/screenObservationSession.ts` and
  `packages/adapters/src/audio/audioObservationSession.ts` define mockable helper contracts, but
  the repository only provides `MockScreenCaptureNativeHelper` and `MockAudioCaptureNativeHelper`.
- `packages/adapters/src/ocr/ocrObservationAdapter.ts` has a `LocalOcrEngine` contract, but the only
  concrete implementation in the repository is `MockOcrEngine`.
- `docs/alpha-release-checklist.md` still states that no signed standalone native perception helper
  is shipped in this checkpoint.

## Why This Blocks 9D

Goal 9D acceptance requires a local macOS smoke that can start, pause, resume, stop, and delete
explicit screen/OCR and audio sessions, update Activity and Today from live opt-in perception Events,
and guarantee that stopping a session tears down streams and prevents delayed jobs from writing new
content.

Implementing a "live bridge" on top of the current mock helpers would not satisfy that acceptance. It
would make the UI and CLI appear live while still depending on fixture data, which would hide the
actual product risk: macOS capture permissions, stream lifetime, protected-app pre-capture
suppression, raw media budgets, OCR/transcription latency, and teardown semantics.

## Required Unblocking Work

1. Add a production macOS perception helper target or equivalent Electron-native capture path with a
   stable local IPC protocol. It must have no network access and must report explicit session state.
2. Implement explicit ScreenCaptureKit display/app/window/region scope selection, sparse frame
   capture, frame hashing, size bounds, and protected-app suppression before persistence or model use.
3. Implement Apple Vision OCR or an equivalent local OCR engine for bounded captured frames with
   Chinese and English support, redaction before `Event` persistence, and no raw screenshot storage
   by default.
4. Implement explicit microphone or meeting/session audio capture and chunking through
   AVFoundation/AVAudioEngine or a documented macOS-supported equivalent. Ambient always-on
   microphone mode remains out of scope.
5. Add a desktop perception session manager that owns start, pause, resume, stop, delete, queue
   depth, selected scope, last processed time, provider state, audit logging, and delayed-job
   cancellation.
6. Package and sign the helper or native capture path with the required macOS usage descriptions and
   entitlements, then verify Screen Recording and Microphone permission behavior on a clean macOS
   profile.
7. Add automated tests for protocol parsing, protected-app suppression, budget enforcement, stop
   cancellation, and no-write-after-delete behavior, plus a manual macOS smoke command for the real
   helper.

## Stop Line

Until the above work exists, Goal 9D remains blocked. Goal 9E LLM Memory/Recommendation schemas and
Goal 9F daily automation scheduling should not be implemented in this checkpoint sequence, because
they depend on the live perception runtime producing trustworthy bounded Events.
