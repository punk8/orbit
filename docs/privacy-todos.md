# Privacy Todos

Privacy is intentionally not fully implemented for the next Alpha planning step, but the following items must remain visible and should become release gates before broader distribution.

## Storage And Retention

- Decide whether raw Event payloads are stored, summarized, or discarded per source.
- Add retention policy configuration.
- Add source-specific sensitivity defaults.
- Add secure deletion behavior for local data clear.
- Evaluate SQLite encryption or OS keychain-backed encryption.

## Redaction

- Add deterministic redaction rules for tokens, secrets, emails, phone numbers, URLs, hostnames, repo URLs, and private file paths.
- Add redaction status per Event.
- Add tests for redaction rule parity.
- Add manual review mode for sanitized fixture generation.

## User Control

- Add pause/resume ingestion.
- Add per-source enable/disable.
- Add source path visibility.
- Add explicit data clear confirmation.
- Add context export preview before writing files.

## Agent Access

- Default agent context should include confirmed Memory and selected Knowledge summaries only.
- Candidate Memory and raw Events should require explicit flags.
- Local HTTP/MCP interfaces must be read-only by default.
- Write operations must require audit logs and explicit user action.

## External Providers

- Keep external AI providers disabled by default.
- Store API keys in OS keychain, not SQLite or plaintext config.
- Make provider calls auditable by source object IDs and purpose.
- Never send raw screenshots, raw chats, or code without user-visible scope.

## Screen Capture Future Work

- Screen sampling and visual context input remain out of Alpha.
- Do not frame this as continuous screen recording by default. The preferred direction is sparse visual observations: active app/window metadata, accessibility text, optional OCR, screenshot/frame references, and event markers that can be grouped into Activity Sessions.
- Borrow the Yansu-style Activity reconstruction pattern: a session timeline can show sampled frames and event markers, while Knowledge and Memory are still generated from structured events and summaries rather than from raw media search alone.
- Before adding it, define permission UX, pause state, storage policy, OCR redaction, per-app exclusion rules, media TTL, local-only guarantees, and user-visible source references.
