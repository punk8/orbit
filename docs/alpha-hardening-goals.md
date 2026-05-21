# Alpha Hardening Goals

## Goal 4: Product Closure And Governance

Scope:

- Implement Knowledge review actions: edit, confirm, reject, archive.
- Implement Memory governance: generate from confirmed Knowledge only, edit, confirm, reject, archive.
- Implement Recommendation actions: accept, dismiss, snooze, resolve.
- Add audit logs for all review/governance actions.
- Add CLI commands for review actions.
- Wire Review Queue UI to real actions through IPC.

Acceptance commands:

```bash
pnpm test
pnpm typecheck
pnpm --filter @orbit/cli orbit ingest fixtures --json
pnpm --filter @orbit/cli orbit knowledge confirm <fixture-knowledge-id> --json
pnpm --filter @orbit/cli orbit memory list --json
pnpm --filter @orbit/desktop typecheck
```

Functional acceptance:

- Re-indexing preserves user review states.
- Memory candidates are generated only from confirmed Knowledge.
- Rejected Knowledge does not produce Memory.
- Recommendation actions do not execute external side effects.
- Every user action writes an audit log.

## Goal 5: Desktop Runtime And Alpha UX

Scope:

- Add configurable menu bar residency.
- Add configurable launch-at-login.
- Add configurable database path with restart/migration boundary.
- Add first-run generic source setup wizard.
- Add source settings for Codex, Claude/generic local agent, approved SeaTalk import, and fixtures.
- Add data operations: re-index, clear local data, export context.
- Add Electron smoke/e2e tests.

Acceptance commands:

```bash
pnpm test
pnpm typecheck
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
```

Functional acceptance:

- A new user can launch Orbit and configure a source without using CLI.
- Menu bar and launch-at-login settings are visible and persisted.
- Re-index, clear, and export actions are available from Settings.
- Electron E2E verifies navigation and fixture data rendering.

## Goal 6: Realistic Source Reliability

Scope:

- Add generic local agent source kind and adapter for Claude/Claude Code style sessions.
- Harden Codex parser against realistic sanitized samples.
- Keep SeaTalk limited to approved imports unless an approved read path exists.
- Add malformed input handling.
- Add cursor/idempotency tests for realistic fixtures.
- Add expected output files for realistic fixture suites.

Acceptance commands:

```bash
pnpm --filter @orbit/adapters test
pnpm test
pnpm typecheck
pnpm --filter @orbit/cli orbit ingest codex --path fixtures/realistic/codex --json
pnpm --filter @orbit/cli orbit ingest local-agent --path fixtures/realistic/local-agent --json
```

Functional acceptance:

- Realistic sanitized fixtures ingest without private raw data.
- Bad records produce warnings, not full ingestion failure.
- Re-running ingestion creates no duplicates.
- Source pointers remain stable.

## Goal 7: Alpha Packaging And Release Gate

Scope:

- Add electron-builder or equivalent packaging pipeline.
- Add `package:dir` for local unpacked app smoke.
- Add `package:dmg` for Alpha distribution artifact.
- Decide signing/notarization path and document required credentials.
- Add packaging smoke test.
- Add Alpha release checklist.

Acceptance commands:

```bash
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop package:dir
pnpm --filter @orbit/desktop package:dmg
pnpm --filter @orbit/desktop test:e2e
```

Functional acceptance:

- Alpha users can install from a DMG artifact.
- Engineering can still run dev/build quickly.
- Release checklist states whether the artifact is signed/notarized.
- Packaging artifacts do not include `.tmp` private samples.

## Goal 8: Alpha Perception And Context Completion

Scope:

- Add opt-in screen/window capture, OCR, vision summarization, audio capture, and transcription as
  real Alpha Source Adapters.
- Keep all high-risk perception disabled by default and independently controllable.
- Add provider task routing for OCR post-processing, vision, and transcription.
- Enforce protected apps, redaction, retention, raw sidecar TTL, audit, and Handoff exclusion policy.
- Connect perception Events into Activity, Knowledge, Memory candidates, Recommendations, Today, and
  Handoff.
- Harden CPU, storage, deletion, native-helper packaging, and macOS permission smoke tests.

Implementation guide:

- [Alpha Perception And Context Completion](./alpha-perception-and-context-completion.md)

Acceptance commands:

```bash
rm -rf .tmp/goal-8-acceptance
export ORBIT_HOME="$PWD/.tmp/goal-8-acceptance"
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
pnpm --filter @orbit/cli orbit perception status --json
pnpm --filter @orbit/cli orbit context today --json
pnpm --filter @orbit/cli orbit handoff today --json
```

Functional acceptance:

- A user can intentionally enable, pause, resume, stop, delete, and audit perception sources.
- Screen/OCR, vision, and audio/transcript Events feed the Orbit semantic pipeline.
- Raw screenshots, raw audio, and raw transcripts are off by default and short-TTL only when enabled.
- Default Handoff includes only redacted summaries and source pointers from export-allowed perception
  sources.
- No keystroke capture, password-field capture, silent browser scraping, or arbitrary filesystem
  scanning is added.

## Recommended Execution Order

1. Goal 4: Product Closure And Governance.
2. Goal 6: Realistic Source Reliability.
3. Goal 5: Desktop Runtime And Alpha UX.
4. Goal 7: Alpha Packaging And Release Gate.
5. Goal 8: Alpha Perception And Context Completion.

Reason:

- Governance controls decide what data is safe to expose.
- Realistic fixtures make UI and runtime work meaningful.
- Desktop UX should be tested against realistic data and real review actions.
- Goal 7 establishes the baseline installable Alpha before high-risk perception is added.
- Goal 8 follows the source, governance, handoff, and packaging foundation so high-risk perception can
  be capability-complete without becoming silent capture.
