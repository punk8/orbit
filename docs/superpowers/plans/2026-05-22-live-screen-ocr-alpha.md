# Live Screen/OCR Alpha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal real macOS Screen/OCR path so Orbit can manually capture the current display, run local OCR, store privacy-minimized screen/OCR Events, and feed the existing Activity/Knowledge/Handoff pipeline.

**Architecture:** Keep the existing perception adapters as the Event boundary. Add one macOS helper that performs a single explicit capture/OCR operation and returns JSON over stdout; add a TypeScript helper wrapper plus a CLI command that ingests the resulting frame through `ScreenObservationAdapter` and `OcrObservationAdapter`. This checkpoint is manual-trigger only and does not add background recording.

**Tech Stack:** Swift/AppKit/CoreGraphics/Vision, TypeScript, pnpm, Vitest, Commander CLI, existing `@orbit/adapters`, `@orbit/core`, and `@orbit/db`.

---

## Acceptance Criteria

- `AGENTS.md` records that minimum real Screen/OCR is now a priority for functional product validation.
- `orbit perception capture-screen-ocr --json` exists.
- On macOS, the command invokes a local helper for one explicit display capture and OCR attempt.
- Captured raw image bytes are not stored by default; persisted Events contain hashes, dimensions, app/window metadata when available, and OCR summary text after existing redaction.
- Screen/OCR source permission scopes remain summary-first, AI-disabled by default, and agent-export-disabled unless policy is explicitly changed later.
- Existing mock/fixture perception commands still work.
- Tests cover helper JSON parsing, ingestion behavior, command registration, and no raw screenshot persistence.

## Tasks

- [x] Add tests for parsing a real capture helper payload into `ScreenCaptureFrame` plus OCR result.
- [x] Implement `MacScreenOcrCaptureHelper` in `packages/adapters/src/screen/macScreenOcrCaptureHelper.ts`.
- [x] Add a Swift one-shot helper at `apps/desktop/native/screen-ocr-helper/Sources/main.swift`.
- [x] Add CLI command `orbit perception capture-screen-ocr --json`.
- [x] Ingest the helper result via existing Screen/OCR adapters and run the semantic pipeline.
- [x] Add tests proving the command is registered and raw image refs are not persisted by default.
- [x] Run:

```bash
pnpm --filter @orbit/adapters test
pnpm --filter @orbit/cli test
pnpm typecheck
pnpm lint
```

- [x] Manual macOS smoke when permissions allow:

```bash
rm -rf .tmp/live-screen-ocr-alpha
export ORBIT_HOME="$PWD/.tmp/live-screen-ocr-alpha"
pnpm --filter @orbit/cli orbit perception capture-screen-ocr --json
pnpm --filter @orbit/cli orbit activity list --json
pnpm --filter @orbit/cli orbit knowledge list --json
```

Expected manual result: if Screen Recording permission is missing, the command returns a clear permission warning and inserts no Events; if permission is granted, it inserts at least one screen Event and, when Vision recognizes text, one OCR Event.

Latest local result on 2026-05-22: Screen Recording permission was available. The command inserted
one `perception_screen` Event and one `perception_ocr` Event, then produced one Activity Session.
The smoke summary was recorded without storing or committing OCR text output.
