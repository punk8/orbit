# macOS Tier 1 Observer Helper

This helper is the Goal 4B Tier 1 capture path for Orbit. It observes only frontmost
application changes and best-effort window titles that macOS exposes without screen,
OCR, audio, clipboard, Accessibility traversal, or keystroke APIs.

Runtime shape:

- local stdio JSON lines only
- no network
- no filesystem writes
- parent Electron process owns privacy policy, protected-app suppression, ingestion,
  redaction, and persistence
- missing window titles are treated as unavailable metadata, not a global capture error

Development usage:

```bash
swift apps/desktop/native/macos-observer/Sources/main.swift --once
swift apps/desktop/native/macos-observer/Sources/main.swift --observe
```

Packaging decision for later checkpoints:

- 4B runs the Swift source through the local Swift toolchain in development.
- Before Beta, package a compiled, signed helper inside the Electron app bundle and
  point `ORBIT_MAC_OBSERVER_HELPER` at that executable during smoke tests.
- The helper API must remain JSON-lines over local stdio.
