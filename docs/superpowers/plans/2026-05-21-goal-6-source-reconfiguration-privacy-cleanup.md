# Goal 6 Source Reconfiguration And Privacy Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Orbit's source management and privacy cleanup safe enough before Handoff Pack, MCP, screen, or audio work begins.

**Architecture:** Extend the existing repository-centered source runtime instead of adding a new service. Database repositories own durable source/cursor/event/audit mutations; Electron main exposes small desktop actions; renderer UI only calls typed APIs and displays i18n strings.

**Tech Stack:** TypeScript, pnpm, Vitest, SQLite via `better-sqlite3`, Electron IPC, React, existing Orbit repositories and desktop snapshot model.

---

## Acceptance Standards

### Required Acceptance Commands

Run these before claiming Goal 6 is complete:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/adapters test
pnpm --filter @orbit/cli orbit ingest fixtures --json
pnpm --filter @orbit/cli orbit context today --json
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop test:e2e
pnpm --filter @orbit/desktop package:dir
pnpm rebuild better-sqlite3
pnpm --filter @orbit/cli orbit status --json
```

If a command cannot run because of a local environment issue, capture the exact command, failure, and the follow-up needed. Do not mark the goal complete unless the core source/privacy behavior is otherwise verified with narrower commands.

### Functional Acceptance

- A user can fix an old source that currently fails with `Missing adapter path; reconfigure this source before background collection.` without deleting the database.
- Sources show exact adapter interface, source kind, path or fixture root, permission scope, raw storage policy, AI policy, export policy, runtime status, cursor presence, and last error.
- A user can disable, enable, pause, resume, delete, reconfigure, and reset cursor for a source from Desktop with confirmation where destructive.
- Deleting a source writes an audit log and removes source runtime/config/cursor rows without deleting unrelated sources.
- Resetting a source cursor writes an audit log and allows re-ingestion without duplicating Events.
- A one-time privacy cleanup removes or minimizes old raw Event `content.text` when the source policy disallows raw storage.
- Privacy cleanup skips or marks failed-redaction/secret events conservatively and writes audit logs.
- Privacy cleanup does not delete Activity Sessions, Knowledge Artifacts, Memories, Recommendations, or their evidence pointers.
- `orbit context today --json` remains raw-private-data-safe by default after cleanup.
- SeaTalk remains approved-import-only.
- No screen, OCR, audio, MCP, cloud sync, or side-effect automation is introduced in this goal.

### TDD Rule

For every behavior change, write or update a failing Vitest test first, run it to verify the expected failure, implement the smallest production change, then run the test again to verify the pass.

## File Map

- Modify `packages/db/src/repositories/sourceRepository.ts`
  - Add source deletion, cursor reset, and config-safe source update helpers where repository ownership is appropriate.
- Modify or create `packages/db/src/repositories/eventRepository.ts`
  - Add old raw text privacy cleanup helpers that preserve event IDs and source pointers.
- Modify or create `packages/db/src/privacyCleanup.ts`
  - Orchestrate cleanup using source permission scopes and event repository mutations.
- Modify `packages/db/src/index.ts`
  - Export new cleanup APIs.
- Modify `packages/db/src/db.test.ts`
  - Cover source delete/reset/reconfigure repository behavior and cleanup safety.
- Modify `apps/desktop/electron/data.ts`
  - Add desktop actions for source reconfigure, delete, cursor reset, and privacy cleanup.
- Modify `apps/desktop/electron/main.ts`
  - Register IPC handlers for the new desktop actions.
- Modify `apps/desktop/src/orbitApi.ts`
  - Add typed API methods and action/result types.
- Modify `apps/desktop/src/routes/SourcesPage.tsx`
  - Add UI actions and confirmation boundaries.
- Modify `apps/desktop/src/i18n.tsx`
  - Add English and Chinese strings for all new user-facing labels/errors.
- Modify `apps/desktop/scripts/e2e-smoke.test.ts` or add focused UI tests if the current setup supports it.
  - Cover text/action presence without requiring private paths.
- Modify `docs/handoff-next-development.md`
  - Update Goal 6 status and remaining watchouts after implementation.

## Task 1: Repository Source Controls

**Files:**

- Modify `packages/db/src/repositories/sourceRepository.ts`
- Modify `packages/db/src/db.test.ts`

- [ ] **Step 1: Write failing tests for source cursor reset and source deletion**

Add tests in `packages/db/src/db.test.ts` near the existing source runtime test:

```ts
it("resets source cursor without deleting the source", () => {
  const orbitHome = mkdtempSync(join(tmpdir(), "orbit-db-source-reset-test-"));
  const database = openOrbitDatabase({ orbitHome });
  try {
    const sources = new SourceRepository(database.db);
    sources.upsertSource(makeSource("fixture_codex"));
    sources.setCursor("fixture_codex", "12");

    sources.resetCursor("fixture_codex");

    expect(sources.getSource("fixture_codex")).toBeTruthy();
    expect(sources.getCursor("fixture_codex")).toBeUndefined();
  } finally {
    database.close();
  }
});

it("deletes source runtime rows without deleting unrelated sources", () => {
  const orbitHome = mkdtempSync(join(tmpdir(), "orbit-db-source-delete-test-"));
  const database = openOrbitDatabase({ orbitHome });
  try {
    const sources = new SourceRepository(database.db);
    sources.upsertSource(makeSource("fixture_codex"));
    sources.upsertSource(makeSource("fixture_seatalk", "seatalk"));
    sources.setCursor("fixture_codex", "12");
    sources.setCursor("fixture_seatalk", "7");

    const result = sources.deleteSource("fixture_codex");

    expect(result.deletedSources).toBe(1);
    expect(result.deletedCursors).toBe(1);
    expect(sources.getSource("fixture_codex")).toBeUndefined();
    expect(sources.getCursor("fixture_codex")).toBeUndefined();
    expect(sources.getSource("fixture_seatalk")).toBeTruthy();
    expect(sources.getCursor("fixture_seatalk")).toBe("7");
  } finally {
    database.close();
  }
});
```

If `makeSource` does not exist in the test file, add a small local helper:

```ts
function makeSource(id: string, kind: SourceKind = "codex"): SourceRecord {
  const now = new Date().toISOString();
  return {
    id,
    kind,
    displayName: id,
    enabled: true,
    paused: false,
    defaultSensitivity: kind === "seatalk" ? "confidential" : "internal",
    permissionScope: defaultPermissionScopeForSource(
      kind,
      kind === "seatalk" ? "confidential" : "internal"
    ),
    createdAt: now,
    updatedAt: now
  };
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm --filter @orbit/db test -- packages/db/src/db.test.ts
```

Expected: tests fail because `resetCursor` and `deleteSource` do not exist.

- [ ] **Step 3: Implement source cursor reset and deletion**

Add to `SourceRepository`:

```ts
resetCursor(sourceId: string): void {
  this.db.prepare("DELETE FROM source_cursors WHERE source_id = ?").run(sourceId);
}

deleteSource(sourceId: string): { deletedSources: number; deletedCursors: number } {
  const transaction = this.db.transaction(() => {
    const deletedCursors = this.db
      .prepare("DELETE FROM source_cursors WHERE source_id = ?")
      .run(sourceId).changes;
    const deletedSources = this.db.prepare("DELETE FROM sources WHERE id = ?").run(sourceId)
      .changes;
    return { deletedSources, deletedCursors };
  });
  return transaction();
}
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
pnpm --filter @orbit/db test -- packages/db/src/db.test.ts
```

Expected: the new source reset/delete tests pass.

## Task 2: Privacy Cleanup Core

**Files:**

- Modify `packages/db/src/repositories/eventRepository.ts`
- Create `packages/db/src/privacyCleanup.ts`
- Modify `packages/db/src/index.ts`
- Modify `packages/db/src/db.test.ts`

- [ ] **Step 1: Write failing test for raw text cleanup**

Add a test that inserts an Event with `content.text` under a source whose permission scope has `canStoreRaw: false`, runs cleanup, and verifies `content.text` is removed while `content.summary` and source pointer remain.

Use the existing event factory patterns in `packages/db/src/db.test.ts`; expected assertions:

```ts
expect(cleanup.cleanedEvents).toBe(1);
expect(cleanedEvent?.content.text).toBeUndefined();
expect(cleanedEvent?.content.summary).toContain("legacy raw");
expect(cleanedEvent?.source.pointer).toBe("fixture://codex/day-1#legacy");
expect(cleanedEvent?.privacy.redactionState).toBe("redacted");
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
pnpm --filter @orbit/db test -- packages/db/src/db.test.ts
```

Expected: test fails because cleanup API does not exist.

- [ ] **Step 3: Add event update helper**

In `EventRepository`, add a method that updates an Event by replacing its JSON payload using the existing Event mapping/encoding patterns. Keep the method narrow:

```ts
updateEvent(event: Event): void {
  this.db
    .prepare(
      `
      UPDATE events
      SET event_json = ?, updated_at = ?
      WHERE id = ?
    `
    )
    .run(encodeJson(event), new Date().toISOString(), event.id);
}
```

Use the actual column names in `packages/db/src/migrations/0001_initial.ts`; if the table stores event JSON under another column, match the migration exactly.

- [ ] **Step 4: Implement cleanup orchestration**

Create `packages/db/src/privacyCleanup.ts`:

```ts
import type { OrbitDatabase } from "./connection";
import { AuditRepository } from "./repositories/auditRepository";
import { EventRepository } from "./repositories/eventRepository";
import { SourceRepository } from "./repositories/sourceRepository";

export interface PrivacyCleanupResult {
  scannedEvents: number;
  cleanedEvents: number;
  skippedEvents: number;
}

export function cleanupLegacyEventPrivacy(database: OrbitDatabase): PrivacyCleanupResult {
  const events = new EventRepository(database.db);
  const sources = new SourceRepository(database.db);
  const audit = new AuditRepository(database.db);
  let scannedEvents = 0;
  let cleanedEvents = 0;
  let skippedEvents = 0;

  for (const event of events.listEvents()) {
    scannedEvents += 1;
    const source = sources.getSource(event.source.id);
    const policy = source?.permissionScope ?? event.privacy.permissionScope;
    if (!event.content.text || policy.canStoreRaw) {
      skippedEvents += 1;
      continue;
    }
    const next = {
      ...event,
      content: {
        ...event.content,
        summary: event.content.summary ?? summarizeLegacyText(event.content.text),
        text: undefined
      },
      privacy: {
        ...event.privacy,
        redactionState: event.privacy.redactionState === "failed" ? "failed" : "redacted"
      }
    };
    events.updateEvent(next);
    cleanedEvents += 1;
  }

  audit.log("privacy.cleanup_legacy_events", "database", undefined, {
    scannedEvents,
    cleanedEvents,
    skippedEvents
  });

  return { scannedEvents, cleanedEvents, skippedEvents };
}

function summarizeLegacyText(text: string): string {
  const normalized = text.replace(/\\s+/g, " ").trim();
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}
```

Adjust imports and property names to match current core Event types.

- [ ] **Step 5: Export cleanup API**

Export from `packages/db/src/index.ts`:

```ts
export * from "./privacyCleanup";
```

- [ ] **Step 6: Run tests and verify pass**

Run:

```bash
pnpm --filter @orbit/db test -- packages/db/src/db.test.ts
```

Expected: cleanup test passes and existing DB tests remain green.

## Task 3: Desktop Main Actions

**Files:**

- Modify `apps/desktop/electron/data.ts`
- Modify `apps/desktop/electron/main.ts`
- Modify `apps/desktop/src/orbitApi.ts`
- Add or modify desktop/electron tests if existing test harness allows direct imports.

- [ ] **Step 1: Write failing test for desktop source action function**

Add a focused test that calls a new exported function such as `resetSourceCursorForDesktop("fixture_codex")` against a temporary `ORBIT_HOME`, then verifies the returned snapshot still contains the source and the cursor was cleared. If direct Electron imports make this brittle, write the test against the lower-level DB function from Task 1 and document that IPC is covered by E2E smoke.

- [ ] **Step 2: Run test and verify failure**

Run the narrow test command chosen in Step 1.

Expected: test fails because the desktop action is not implemented.

- [ ] **Step 3: Add typed API methods**

In `apps/desktop/src/orbitApi.ts`, add methods for:

```ts
reconfigureSource(sourceId: string, kind: SourceSetupKind, path?: string): Promise<DesktopActionResult>;
deleteSource(sourceId: string): Promise<DesktopActionResult>;
resetSourceCursor(sourceId: string): Promise<DesktopActionResult>;
cleanupLegacyEventPrivacy(): Promise<DesktopActionResult>;
```

Use the existing `window.orbit` bridge style.

- [ ] **Step 4: Add Electron data functions**

In `apps/desktop/electron/data.ts`, add:

- `reconfigureSourceForDesktop`
- `deleteSourceForDesktop`
- `resetSourceCursorForDesktop`
- `cleanupLegacyEventPrivacyForDesktop`

Each function must:

- verify the source exists when a source ID is provided,
- write an audit log,
- return `DesktopActionResult`,
- call `readDesktopSnapshot()` for updated state,
- keep SeaTalk approved-import-only by using the existing `SeaTalkAdapter` approved import path only.

- [ ] **Step 5: Register IPC handlers**

In `apps/desktop/electron/main.ts`, register handlers matching the typed API names.

- [ ] **Step 6: Run tests and verify pass**

Run:

```bash
pnpm --filter @orbit/desktop test
pnpm typecheck
```

Expected: desktop tests and typecheck pass.

## Task 4: Sources UI And i18n

**Files:**

- Modify `apps/desktop/src/routes/SourcesPage.tsx`
- Modify `apps/desktop/src/i18n.tsx`
- Modify `apps/desktop/src/styles.css` only if existing classes cannot support the controls.

- [ ] **Step 1: Write failing UI text/action test**

Extend the current desktop test coverage to assert new i18n keys or rendered labels exist for:

- Reconfigure
- Reset cursor
- Delete source
- Cleanup legacy privacy
- Chinese equivalents

Run the test and verify it fails before adding strings/UI.

- [ ] **Step 2: Add i18n strings**

Add English and Simplified Chinese strings for all new labels, confirmations, success messages, and error boundaries. Do not hard-code user-facing text in `SourcesPage.tsx`.

- [ ] **Step 3: Add UI actions**

In `SourcesPage.tsx`, add controls that:

- call pause/resume/enable/disable as today,
- reconfigure a source path using the existing setup kind/path pattern,
- reset cursor with confirmation,
- delete source with confirmation,
- trigger privacy cleanup with confirmation,
- display success/error messages from `DesktopActionResult`.

Use existing UI conventions and avoid nested card layouts.

- [ ] **Step 4: Run UI tests and typecheck**

Run:

```bash
pnpm --filter @orbit/desktop test
pnpm typecheck
```

Expected: tests and typecheck pass.

## Task 5: CLI/Context Safety Regression

**Files:**

- Modify `apps/cli/src/cli.test.ts` if needed.
- Modify `packages/core/src/context/todayContext.test.ts` if needed.

- [ ] **Step 1: Add regression test for context safety after cleanup**

Add a test that inserts an old raw-text Event, runs cleanup, builds today's context, and verifies the JSON context does not include the raw text.

- [ ] **Step 2: Run test and verify failure or meaningful coverage gap**

Run the narrow test command.

Expected: test fails if context currently leaks raw text; if the context already excludes raw text, the test should pass only after cleanup API is wired into the setup.

- [ ] **Step 3: Fix context leak if found**

If the test exposes a leak, update the relevant context builder to use summaries/evidence pointers only.

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm --filter @orbit/core test
pnpm --filter @orbit/cli test
```

Expected: context and CLI tests pass.

## Task 6: Documentation And Handoff Update

**Files:**

- Modify `docs/handoff-next-development.md`
- Modify `docs/privacy-permissions.md` if cleanup behavior needs permanent documentation.

- [ ] **Step 1: Update docs**

Document:

- source reconfiguration behavior,
- source delete/reset cursor behavior,
- privacy cleanup behavior,
- any residual limitations,
- acceptance commands actually run.

- [ ] **Step 2: Run doc formatting**

Run:

```bash
pnpm exec prettier --check docs/handoff-next-development.md docs/privacy-permissions.md docs/superpowers/specs/2026-05-21-product-direction-handoff-perception.md docs/superpowers/plans/2026-05-21-goal-6-source-reconfiguration-privacy-cleanup.md
```

Expected: Prettier check passes.

## Task 7: Final Verification And Checkpoint

**Files:**

- All modified files.

- [ ] **Step 1: Run required acceptance commands**

Run every command listed in **Required Acceptance Commands**.

- [ ] **Step 2: Inspect git status**

Run:

```bash
git status --short
```

Expected: only Goal 6 files are modified.

- [ ] **Step 3: Commit and push if the checkpoint is clean**

If all required verification passes and no unrelated changes are present:

```bash
git add <goal-6-files>
git commit -m "feat: add source reconfiguration privacy cleanup"
git push
```

If verification fails or unrelated changes are present, do not force a commit. Report the exact blocker and next action.
