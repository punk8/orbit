# Perception Research Spike

Last updated: 2026-05-21

## Product Position

Screen, OCR, vision, and audio perception are first-class Orbit Source Adapter inputs for Alpha Goal 8. They matter because many useful work signals never enter Codex, SeaTalk, Git, calendar, or
documents: browser research, UI debugging, design review, window switching, meeting context, and
non-text workflows.

They are not the center of Orbit. The product center remains:

```text
Source Adapter -> Event -> Activity Session -> Knowledge Artifact -> Memory -> Recommendation -> Handoff Pack
```

Perception should feed this chain as evidence. It should not turn Orbit into a screenshot search tool, a screen recorder, an always-on microphone, or a raw media archive.

Goal 7 shipped only research and disabled descriptors. Goal 8 is the explicit implementation goal
for opt-in screen/OCR/vision/audio capability completion. See
[Alpha Perception And Context Completion](./alpha-perception-and-context-completion.md).

This research document remains the technical reference for Goal 8, but the implementation boundary is
now the Goal 8 checkpoint plan rather than an indefinite "future" bucket.

## macOS Accessibility Path

The recommended first implementation is active app/window metadata plus Accessibility text, because it gives Orbit useful work context with lower storage and privacy risk than frame capture.

Useful system paths:

- [NSWorkspace.frontmostApplication](https://developer.apple.com/documentation/appkit/nsworkspace/frontmostapplication) identifies the frontmost app receiving key events.
- The macOS Accessibility API exposes UI element attributes through functions such as [AXUIElementCopyAttributeValues](https://developer.apple.com/documentation/applicationservices/1462060-axuielementcopyattributevalues).

Planned adapter behavior:

- Poll or subscribe to active app/window changes at a sparse cadence.
- Capture app bundle ID, app name, window title, URL when available, focused element role, selected text, and bounded visible text.
- Prefer structured Accessibility text over screenshots.
- Store only normalized `Event` summaries and source pointers unless raw storage is explicitly enabled later.
- Treat inaccessible apps as metadata-only observations, not failures to bypass with pixels.

## ScreenCaptureKit Path

If Orbit later needs explicit screen or window capture, the macOS path should use [ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit). Apple documents ScreenCaptureKit as the framework for selecting displays, apps, and windows and streaming chosen content to the app. Apple's [Capturing screen content in macOS](https://developer.apple.com/documentation/screencapturekit/capturing_screen_content_in_macos) sample covers display/window/app filters, stream output, frames, audio samples, and the system Screen Recording permission prompt.

Orbit should use ScreenCaptureKit only after a production-capture gate is passed:

- User chooses the display, app, or window scope.
- The desktop UI shows a visible running state.
- Pause and stop are always available.
- App/window exclusions are enforced before capture starts.
- Raw frame persistence is disabled by default.

Screen capture should be sparse and purpose-bound. Full-fidelity continuous recording is not a good default for Orbit because it increases trust, storage, CPU, redaction, and review costs.

## Apple Vision OCR Path

OCR should be a fallback after Accessibility text. Apple's Vision framework provides text recognition through [VNRecognizeTextRequest](https://developer.apple.com/documentation/vision/vnrecognizetextrequest), which recognizes text in an image and returns recognized text observations.

Planned use:

- Run OCR only on explicit captured frames, thumbnails, or short-lived screenshots.
- Prefer smaller regions of interest such as active window content, selected screen areas, or visible text regions.
- Use language settings that support Chinese and English.
- Persist OCR output only after redaction and retention checks.
- Store raw screenshots with short TTL or not at all.

OCR output should become a `screen_observation` Event summary, not a screenshot dump.

## Audio Capture And Transcription

Audio is a first-class Goal 8 Source Adapter, but always-on microphone capture should not be Orbit's first audio implementation.

Possible system paths:

- [AVCaptureDevice.authorizationStatus(for:)](https://developer.apple.com/documentation/avfoundation/avcapturedevice/1624613-authorizationstatus) and `requestAccess` provide microphone permission checks and prompts for audio capture.
- [AVAudioEngine](https://developer.apple.com/documentation/avfaudio/avaudioengine/) can process audio input through its input node and engine graph.
- ScreenCaptureKit can also provide audio samples for selected screen capture streams when the user explicitly captures shared content.

Recommended first audio shape:

- Explicit meeting/session mode, not ambient always-on microphone.
- Local transcription by default when available.
- No raw audio retention unless the user turns on a short TTL.
- Transcript redaction before persistence.
- Agent export blocked by default for raw audio and raw transcripts.

Always-on microphone is high risk because bystanders, private conversations, background calls, and non-work speech can enter the data stream without clear intent.

## Permission Prompts And Visible Running State

Before any production perception adapter ships, the desktop shell must explain:

- What source is being enabled.
- What fields can be read.
- Whether raw media is captured.
- Whether summaries can be stored.
- Whether AI can use the data.
- Whether agent export is allowed.
- How to pause, stop, delete, and exclude sources.

Runtime UI requirements:

- Menu bar/tray state clearly shows when perception is active.
- Settings shows enabled, paused, last sync, retention, raw storage, AI, and agent export policy.
- Per-source controls allow pause/resume and disable/delete.
- Capture-specific screens show the selected display, window, app, or microphone scope.

## Pause And Stop Behavior

Pause must stop new collection immediately while keeping existing local records intact. Stop/disable must stop collection, clear runtime handles, and require explicit re-enable before future collection.

For screen/audio, pause and stop must also:

- Tear down active streams or audio engines.
- Flush in-memory frame/audio buffers.
- Prevent delayed OCR/transcription jobs from persisting new content unless they were already user-approved.
- Write a local audit log entry.

## App And Window Exclusion Model

Perception needs a deny-by-default path for sensitive contexts:

- User-configured excluded apps by bundle ID.
- User-configured excluded window title patterns.
- Browser URL/domain exclusions when available.
- Built-in exclusions for password managers, authentication prompts, keychain windows, private browsing, and system settings pages that manage secrets.
- Temporary "ignore current app/window" action from the desktop shell.

Exclusions must run before frame capture, OCR, transcription, AI processing, and agent handoff assembly.

## Raw Media TTL Policy

Default policy:

- Raw screenshots: disabled. If enabled later, short TTL measured in minutes or hours, not indefinite retention.
- Raw audio: disabled. If enabled later, meeting/session-scoped TTL only.
- Raw transcripts: store redacted transcript summaries by default; raw transcript text requires explicit opt-in and retention.
- OCR text: store bounded, redacted text snippets or summaries, not full-screen dumps.

Memory and Knowledge should cite perception Events through source pointers and hashes. They should not depend on raw media being retained forever.

## Local-Only Processing Default

Perception processing should be local by default:

- Accessibility extraction runs locally.
- Screen capture and OCR run locally.
- Audio capture and transcription should prefer local models for the first implementation.
- External AI use requires source permission, redaction, audit logging, and user-visible policy.

Raw screenshots, raw audio, raw transcripts, and failed-redaction perception data must be blocked from default Handoff Packs and agent export.

## Storage And CPU Risks

Main risks:

- Continuous frames can grow storage quickly.
- OCR on full frames can burn CPU and battery.
- Audio capture and transcription can create large buffers and sustained compute load.
- Redaction after capture can fail, leaving sensitive raw text or media.
- Indexing raw OCR/transcripts can make deletion and review harder.

Mitigations:

- Start with metadata and Accessibility text.
- Use sparse sampling only when explicit capture is approved.
- Apply app/window exclusions before capture.
- Bound OCR regions and text length.
- Use short TTL for raw media.
- Track per-source CPU/storage budgets.
- Add audit logs for enable, pause, stop, delete, OCR, transcription, and handoff export decisions.

## Event Schema Mapping

Screen metadata and Accessibility text should map to existing `Event` fields:

- `source.kind`: `screen`
- `type`: `screen_observation`
- `context.app`: active app name
- `context.windowTitle`: active window title
- `context.url`: browser URL when available and allowed
- `content.title`: compact observation title
- `content.summary`: bounded visible text or activity summary
- `content.rawRef`: only if raw capture is explicitly enabled and retained
- `privacy.redactionState`: `none`, `redacted`, or `failed`

Future audio should use:

- `source.kind`: `audio`
- future `type`: `audio_observation` or `meeting`
- `content.summary`: redacted transcript summary
- `content.rawRef`: only for explicit, short-TTL raw audio or transcript storage

The current code only adds `SourceKind` `audio` for disabled capability descriptors. It does not add an audio adapter or production audio event type.

## Recommended Goal 8 Implementation Sequence

1. Goal 8A: add the perception source control plane, provider policy, audit logs, protected apps,
   retention, and disabled-by-default settings.
2. Goal 8B: add explicit sparse screen/window capture and OCR after Screen Recording permission,
   scope selection, protected-app suppression, and short-retention policy are verified.
3. Goal 8C: add vision model summarization with mock/local/provider policy, redaction before model
   use, and no external AI by default.
4. Goal 8D: add explicit meeting/session audio capture and transcription, not ambient always-on
   microphone capture.
5. Goal 8E: connect perception evidence to Activity, Knowledge, Memory candidates, Recommendations,
   Today, and Handoff.
6. Goal 8F: harden performance budgets, cleanup, audit review, packaging, and macOS permission smoke
   tests before Alpha release.

## Production-Capture Gate Checklist

Raw screen or audio capture must not land until all items are confirmed:

- Permission copy explains exactly what will be captured.
- Visible running state exists in menu bar/tray and settings.
- Pause and stop controls are always available and verified.
- Retention defaults disable raw media or use short TTL.
- Exclusion UI exists for apps, windows, and browser domains.
- Audit logging covers enable, capture start, pause, stop, delete, redaction failure, OCR/transcription, and handoff generation.
- Local processing is the default.
- Redaction runs before persistence of OCR/transcript text.
- Agent export is blocked by default for raw perception data.
- CPU and storage budgets are defined and measured.
- Explicit user approval is required before any raw media capture code ships.
