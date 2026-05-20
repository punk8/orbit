# Sanitized Real Fixtures Guide

## Purpose

Orbit needs realistic local samples before Alpha hardening. Current synthetic fixtures prove the pipeline but do not cover messy agent sessions, long context, failed commands, interrupted work, or privacy edge cases.

Do not commit private raw data. Only commit manually reviewed sanitized fixtures.

## Recommended Directory Layout

Private working area, ignored by git:

```text
.tmp/private-samples/
  raw/
  redacted/
  review/
```

Committed sanitized fixtures:

```text
fixtures/realistic/
  local-agent/
  codex/
  claude/
  seatalk-approved/
  expected/
```

## Minimum Sample Set

Prepare at least these samples:

- 3 long local agent sessions with 50+ message/tool records.
- 2 failed-debugging sessions with command errors and test failures.
- 2 code-change sessions with before/after decisions.
- 2 task-switching sessions that cross projects or topics.
- 2 cross-day sessions.
- 2 approved SeaTalk import samples with group discussion, private message, mention, decision, and follow-up.
- 3 malformed inputs: empty file, invalid JSONL line, missing timestamp.
- 2 duplicate/re-ingestion samples.
- 2 sensitive-content samples after redaction.

## Sanitization Rules

Replace:

- names -> `Person A`, `Person B`
- company/project internals -> `Project Alpha`, `Service Beta`
- paths -> `/Users/example/project-alpha`
- repo URLs -> `git@example.com:org/project-alpha.git`
- tokens/API keys -> `REDACTED_TOKEN`
- emails -> `person@example.com`
- phone numbers -> `+10000000000`
- credentials/secrets -> `REDACTED_SECRET`
- ticket IDs -> `PROJ-123`
- hostnames/IPs -> `example.internal`, `10.0.0.1`

Preserve:

- event order
- timestamps at day/time granularity
- source kind
- message/tool/result shape
- command success/failure semantics
- project/thread/session boundaries
- follow-up and decision semantics

## Manual Review Checklist

Before moving a fixture into `fixtures/realistic`:

- Search for real names, emails, tokens, domains, repo URLs, and absolute private paths.
- Confirm no raw screenshots, attachments, or proprietary code are included.
- Confirm the fixture still exercises the intended behavior.
- Confirm source pointers are stable and non-private.
- Confirm expected counts are documented.

## Source-Neutral Agent Fixture Shape

Alpha should support more than Codex. Add a generic local agent import shape before relying on real Claude samples.

Recommended normalized fixture input:

```json
{
  "sourceKind": "local_agent",
  "adapterKind": "claude_code",
  "externalId": "sample-001",
  "occurredAt": "2026-05-20T10:00:00.000Z",
  "type": "message",
  "title": "Investigate failing tests",
  "text": "Person A asked the agent to inspect a failing test.",
  "actor": { "role": "user", "displayName": "Person A" },
  "context": {
    "app": "Claude Code",
    "project": "Project Alpha",
    "repository": "project-alpha",
    "threadId": "sample-thread-001"
  },
  "classification": {
    "topics": ["testing", "debugging"],
    "entities": ["Vitest"],
    "intent": "debugging",
    "confidence": 0.86
  },
  "sensitivity": "internal"
}
```

Current code does not yet have `local_agent` as a `SourceKind`; adding this is part of the next hardening goals.

## Preparation Workflow

1. Copy raw exports into `.tmp/private-samples/raw`.
2. Redact into `.tmp/private-samples/redacted`.
3. Run parser/normalizer locally.
4. Inspect generated Events and source pointers.
5. Manually review redacted output.
6. Move approved fixtures to `fixtures/realistic`.
7. Add expected counts and golden tests.

## Do Not Do

- Do not commit raw private exports.
- Do not store screenshots/audio/video in fixtures.
- Do not use live SeaTalk scraping as a fixture source.
- Do not use AI provider calls to redact secrets until the output is manually reviewed.
