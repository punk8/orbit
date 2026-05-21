# Release Readiness Spec

## Purpose

This document defines the operational, privacy, packaging, testing, and support gates required
before Orbit can move from Alpha dogfood to a complete user-installable product.

## Release Levels

### Developer Runtime

Audience:

- Developers and agents working in the repository.

Requirements:

- `pnpm test`
- `pnpm typecheck`
- CLI commands run against `ORBIT_HOME`.
- Desktop dev server can launch.
- Fixture ingestion and re-index work.

### Alpha Runtime

Audience:

- Trusted internal users.

Requirements:

- Packaged macOS app.
- DMG or ZIP artifact.
- Explicit source setup.
- Local-only defaults.
- Menu bar state.
- Pause/resume collection.
- Source disable.
- Re-index, export, clear local data.
- Review flows for Knowledge, Memory, and Recommendations.
- No silent private-path scanning.

### Complete Product Runtime

Audience:

- Users outside the development team.

Requirements:

- Signed and notarized macOS app.
- Stable installer/update story.
- Migration and rollback policy.
- Privacy/security review.
- Performance budget.
- Support/debug bundle.
- Complete-product scenario tests.
- Source adapter readiness for every enabled production source.

## Packaging Requirements

The macOS product must provide:

- Development run mode.
- Unpacked app smoke target.
- DMG artifact.
- ZIP artifact if auto-update is planned.
- Code signing.
- Notarization before external distribution.
- Stable app ID and product name.
- Clear app version and build metadata.

Packaging smoke must verify:

- App launches from packaged artifact.
- Main window opens.
- Menu bar item appears when enabled.
- Quit works.
- Pause/resume works.
- Source setup works.
- Database path is visible.
- App does not silently read private default paths.

## Database And Migration Requirements

Required:

- Every schema change has a migration.
- Migrations are idempotent on existing databases.
- Migration tests cover empty DB, Alpha DB, and latest DB.
- Failed migration does not delete user data.
- WAL mode remains enabled.
- FTS sidecars rebuild successfully.
- Vector sidecars, when enabled, are rebuildable and deletable.

User-facing requirements:

- Settings shows active `ORBIT_HOME` and DB path.
- Changing DB location is a restart boundary unless live migration is explicitly implemented.
- Export/debug bundle must exclude private raw payloads by default.

## Privacy And Security Gates

Before release, verify:

- Source setup is explicit.
- Permission scope is visible per source.
- Raw storage default is off except explicitly justified short-TTL perception data.
- Secret patterns are redacted before raw persistence where feasible.
- Failed redaction blocks raw persistence and default agent export.
- External AI requests require explicit provider configuration.
- External AI payload assembly checks source policy and sensitivity.
- AI connection tests use synthetic prompts only.
- API keys are encrypted outside SQLite plaintext.
- Handoff excludes raw private payloads, draft Knowledge, unconfirmed Memory, secret content,
  failed-redaction data, and non-exportable sources by default.
- Clear local data requires confirmation and writes an audit log.
- Audit logs avoid raw private payloads.

## Audit Requirements

Audit logs must be written for:

- Source added, disabled, paused, resumed, reconfigured, deleted.
- Cursor reset.
- Ingestion started, completed, failed.
- Pipeline re-index.
- Knowledge edited, confirmed, rejected, archived.
- Memory generated, edited, confirmed, rejected, archived.
- Recommendation accepted, dismissed, snoozed, resolved.
- Handoff generated.
- Context exported.
- AI provider request, success, failure, and skipped-by-policy.
- Settings changed.
- Data cleared.
- Privacy cleanup run.
- Perception sidecar cleanup run.
- Perception release gate evaluated.

Audit log entries should include:

- Operation.
- Object type.
- Object ID when available.
- Timestamp.
- Minimal structured details.
- Provider/source metadata where relevant.
- No raw private payloads.

Perception audit review must cover capture start/stop, pause/resume, redaction failure,
model-assisted vision/OCR/transcription calls or policy skips, raw sidecar deletion, and Handoff
inclusion/exclusion counts.

## Performance Budgets

Complete product defaults should target:

- Background ingestion does not block UI.
- Ingestion cycle handles malformed source records without stopping other sources.
- Re-index is idempotent and reports progress for large stores.
- Desktop initial load remains usable with thousands of Events.
- Source adapters respect CPU and storage limits.
- Screen/audio capture, when enabled, has explicit CPU/storage budgets and visible running state.

Current Alpha perception budgets:

- CPU: max 10% capture duty cycle, minimum 30s screen interval, max 6 OCR frames/minute.
- Battery: pause when Low Power Mode is active and below 20%.
- Storage: max 250 MB raw sidecars with 60 minute default TTL.
- Queue: max 1000 queued observations, 25 item drain batch, raw stripped before event drops.
- Provider: max 60 requests/hour, 4000 input chars/request, 100k tokens/hour, external off by
  default.

Concrete numeric budgets should be set once realistic dogfood data volume is available. Until then,
performance tests should cover small, medium, and large synthetic stores.

## Reliability Requirements

Required behavior:

- Background ingestion is concurrency guarded.
- A failing source does not block all other sources.
- Errors are visible in Sources and runtime status.
- Re-running ingestion does not duplicate Events.
- Re-running re-index does not duplicate derived objects.
- Review state is preserved across rebuilds.
- App restart resumes configured sources only when collection is not paused.
- App shutdown does not corrupt database state.

## User Support And Debug Bundle

The product should provide a local debug bundle action.

Default bundle includes:

- App version.
- OS version.
- Orbit settings excluding secrets.
- Source metadata excluding raw payloads.
- Migration status.
- Counts by object type.
- Recent audit operations.
- Recent errors and warnings.
- Redaction/policy summary.

Default bundle excludes:

- Raw Event text.
- Screenshots.
- Audio.
- Transcripts.
- API keys.
- Private message bodies.
- Full command output.
- Full document/mail content.

Expanded bundle can be designed later but must require explicit user review.

## Test Matrix

Required automated tests:

- Core domain state transitions.
- Source adapter idempotency and malformed input.
- Storage migrations and repository CRUD.
- FTS search and cleanup.
- Ingestion privacy policy.
- Semantic pipeline deterministic fallback.
- AI provider schema and failure handling.
- Governance actions and audit logs.
- Handoff inclusion/exclusion policy.
- Desktop IPC.
- Renderer route smoke tests.
- Packaged app smoke tests.

Required manual or semi-automated tests:

- First-run setup.
- Background observation setup.
- Permission-needed, collecting, paused, warning, and error runtime states.
- Protected-app exclusion behavior.
- Source setup with explicit path.
- Pause/resume from menu bar.
- Re-index.
- Export context.
- Clear local data confirmation.
- AI provider configuration and synthetic connection test.
- Chinese UI and generated content flow.
- Handoff preview/copy.

## Complete Release Checklist

Before marking a release complete:

- Product scenarios in [Complete Product Spec](./complete-product-spec.md) pass.
- Enabled production adapters meet [Source Adapter Complete Contract](./source-adapter-complete-contract.md).
- Semantic evals in [Semantic Quality And Evaluation](./semantic-quality-evaluation.md) pass.
- Privacy/security gates pass.
- Packaging smoke passes on a clean machine.
- Migration tests pass from previous release.
- No known source silently reads private data.
- Background observation never captures raw screen/OCR/audio without explicit gates.
- No enabled workflow performs external side effects without explicit design.
- No default context export includes raw private payloads.
- Documentation is updated for user-visible behavior.

## Rollout Policy

Recommended rollout stages:

1. Developer dogfood with fixtures and sanitized local exports.
2. Internal Alpha with explicit local sources.
3. Private Beta with signed/notarized builds and limited production adapters.
4. Public release only after source, privacy, eval, packaging, and support gates are met.

Rollback requirements:

- Keep prior installer available.
- Preserve user data on downgrade when schema allows.
- If downgrade is unsafe, detect and explain the block.
- Export context/debug bundle before destructive recovery guidance.
