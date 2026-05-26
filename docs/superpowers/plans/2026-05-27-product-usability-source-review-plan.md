# Product Usability Source And Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first product-usability slice for Activity capture focus, Knowledge/Review workbench flow, Recommendation dedupe/lifecycle, and explicitly authorized real-source expansion.

**Architecture:** Keep the existing Electron + React + pnpm monorepo shape. Add focus hints to desktop action results, UI-only focus state in App, pure recommendation dedupe helpers in core/db pipeline, and explicit-import source kinds that reuse existing adapters.

**Tech Stack:** TypeScript, React, Electron IPC, better-sqlite3 repositories, Vitest, pnpm.

---

## File Structure

- Modify `apps/desktop/src/orbitApi.ts`: add `DesktopActionFocus`, extend `DesktopActionResult`, extend `SourceSetupKind`.
- Modify `apps/desktop/electron/data.ts`: compute focus payloads for Screen/OCR capture and source imports; build new explicit-import adapters.
- Modify `apps/desktop/electron/main.ts`: accept new `SourceSetupKind` values.
- Modify `apps/desktop/src/App.tsx`: route desktop action focus to Activity/Knowledge pages.
- Modify `apps/desktop/src/routes/ActivityPage.tsx`: consume focus session id and clear filters for latest capture.
- Modify `apps/desktop/src/routes/KnowledgePage.tsx`: consume focused artifact id; improve edit/preview/evidence layout.
- Modify `apps/desktop/src/routes/ReviewQueuePage.tsx`: add evidence expansion, metrics, open/edit actions, action advancement.
- Modify `apps/desktop/src/routes/RecommendationsPage.tsx`: add active/snoozed/closed filters and lifecycle copy.
- Modify `apps/desktop/src/routes/SourcesPage.tsx`: expose new source setup kinds and preview boundaries.
- Modify `apps/desktop/src/i18n.tsx`: add all user-visible strings.
- Modify `packages/core/src/recommendation/generateRecommendations.ts`: export dedupe key helper.
- Modify `packages/db/src/semanticPipeline.ts`: merge duplicate open recommendations instead of inserting noise.
- Add/modify tests in nearby `*.test.ts` files.

## Task 1: Activity Capture Focus

- [ ] Write failing source/API tests:

```ts
expect(apiSource).toContain("DesktopActionFocus");
expect(apiSource).toContain("focus?: DesktopActionFocus");
expect(appSource).toContain("applyDesktopActionFocus");
expect(activitySource).toContain("focusSessionId");
expect(activitySource).toContain("onFocusConsumed");
```

- [ ] Run `pnpm test -- --run apps/desktop/src/routes/ActivityPage.test.ts apps/desktop/electron/data.test.ts`.
- [ ] Add `DesktopActionFocus` to `orbitApi.ts`.
- [ ] Add focus state and `applyDesktopActionFocus` in `App.tsx`.
- [ ] Pass `focusSessionId` and `onFocusConsumed` to `ActivityPage`.
- [ ] In Electron capture functions, collect inserted event ids and resolve focused session from the refreshed snapshot.
- [ ] Run targeted tests and then `pnpm typecheck`.

## Task 2: Knowledge/Review Workbench

- [ ] Write failing ReviewQueue source tests for `review.showEvidence`, `review.openKnowledge`, confidence, sensitivity, source sessions, and `EvidenceList`.
- [ ] Write failing KnowledgePage source tests for `knowledge-edit-workbench`, editable Markdown preview, and focus artifact consumption.
- [ ] Add App focus route for Knowledge.
- [ ] Add `focusArtifactId` to `KnowledgePage` and consume it.
- [ ] Refactor Knowledge edit panel into a two-column edit/preview/evidence workbench.
- [ ] Expand ReviewQueue cards with metrics, evidence toggles, and open/edit actions.
- [ ] Run targeted tests and `pnpm typecheck`.

## Task 3: Recommendation Dedupe And Lifecycle

- [ ] Write failing core test for `recommendationDedupeKey`.
- [ ] Write failing db pipeline test that two duplicate generated recommendations merge into one open record.
- [ ] Export `recommendationDedupeKey` and merge evidence safely.
- [ ] Update semantic pipeline to merge duplicate open recommendations and audit `recommendation.dedupe_merge`.
- [ ] Add RecommendationsPage active/snoozed/closed/all filter segments.
- [ ] Run targeted tests and `pnpm typecheck`.

## Task 4: Explicit Real Source Expansion

- [ ] Write failing desktop data tests for new `SourceSetupKind` values.
- [ ] Add parser adapters or explicit JSON readers for browser import, terminal import, file activity import, and project directory metadata.
- [ ] Wire new kinds through `orbitApi.ts`, `data.ts`, `main.ts`, `SourcesPage.tsx`, and i18n.
- [ ] Verify previews do not write sources/events.
- [ ] Verify confirmed imports are `import_only` and background ingestion skips them.
- [ ] Run targeted tests and `pnpm typecheck`.

## Task 5: Full Checkpoint Verification

- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm --filter @orbit/desktop build`.
- [ ] Run `pnpm --filter @orbit/desktop package:dir`.
- [ ] Inspect `git status --short --ignored` for raw sidecars, DBs, release artifacts, and autoresearch files.
- [ ] Update `docs/todo.md` with what passed and remaining gaps.
- [ ] Commit only relevant tracked files and push the current branch.
