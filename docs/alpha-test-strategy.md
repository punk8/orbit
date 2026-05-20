# Alpha Test Strategy

## Research Notes

Playwright provides experimental Electron automation through `_electron`, including launching an Electron main script, getting the first window, reading window title, taking screenshots, and closing the app.

Electron supports Tray/menu-bar behavior through the `Tray` API and launch-at-login behavior through `app.setLoginItemSettings`.

Electron Builder documents macOS targets including `dir`, `dmg`, and `zip`. `dmg` is the standard user-facing macOS distribution format, while `dir` is best for development/debugging and `zip` is commonly paired with DMG for auto-update payloads.

References:

- Playwright Electron: `https://playwright.dev/docs/api/class-electron`
- Playwright ElectronApplication: `https://playwright.dev/docs/api/class-electronapplication`
- Electron Tray: `https://www.electronjs.org/docs/latest/tutorial/tray`
- Electron app login items: `https://www.electronjs.org/docs/latest/api/app`
- Electron Builder macOS targets: `https://www.electron.build/docs/targets/`

## Test Layers

### 1. Core Unit Tests

Scope:

- ID/hash determinism.
- state transitions.
- evidence refs.
- Activity grouping.
- Knowledge draft generation.
- Memory candidate extraction.
- Recommendation generation.

Command:

```bash
pnpm --filter @orbit/core test
```

### 2. Repository And Migration Tests

Scope:

- migrations from empty DB.
- forward-only migration safety.
- CRUD round trips.
- FTS insert/search/delete cleanup.
- audit log writes.

Command:

```bash
pnpm --filter @orbit/db test
```

### 3. Adapter Golden Tests

Scope:

- fixture adapter idempotency.
- Codex sanitized session imports.
- generic local agent fixtures.
- approved SeaTalk imports.
- malformed file handling.
- cursor persistence.

Required golden fixtures:

- expected Event count.
- expected source pointers.
- expected warning/error shape.
- expected derived object count after pipeline.

Command:

```bash
pnpm --filter @orbit/adapters test
```

### 4. Pipeline Contract Tests

Scope:

- ingest -> Activity -> Knowledge -> Memory -> Recommendation.
- repeated pipeline run creates no duplicates.
- confirmed/rejected/archived states are preserved during re-index.
- Memory extraction only uses confirmed Knowledge.
- Recommendations are not generated without evidence.

Command:

```bash
pnpm test
```

### 5. CLI Contract Tests

Scope:

- JSON output shape for `status`, `ingest`, `context`, review commands, data operations.
- command exits and error messages.
- `ORBIT_HOME` isolation.
- no raw private payload in default output.

Recommended contract commands:

```bash
ORBIT_HOME=.tmp/test-orbit pnpm --filter @orbit/cli orbit ingest fixtures --json
ORBIT_HOME=.tmp/test-orbit pnpm --filter @orbit/cli orbit context today --json
ORBIT_HOME=.tmp/test-orbit pnpm --filter @orbit/cli orbit memory list --json
```

### 6. Renderer Component Tests

Scope:

- empty states.
- loading/error states.
- review queue rendering.
- source status rendering.
- settings toggles rendering.

Recommended tool:

- Vitest with React Testing Library, once UI state grows beyond static rendering.

### 7. Electron Smoke And E2E Tests

Scope:

- app launches from built Electron main file.
- first window opens.
- required navigation pages render.
- fixture data appears in Today/Activity/Knowledge/Memory/Recommendations.
- Settings page shows local DB path and toggles.
- app closes cleanly.

Recommended tool:

- Playwright `_electron`, with one worker for Electron app tests.

Important local environment note:

- In the current Codex environment, unset `ELECTRON_RUN_AS_NODE` when launching Electron for smoke tests:

```bash
env -u ELECTRON_RUN_AS_NODE pnpm --filter @orbit/desktop exec electron dist-electron/main.cjs
```

### 8. Packaging Smoke Tests

Scope:

- renderer build succeeds.
- Electron main/preload build succeeds.
- unpacked app or `dir` target launches.
- DMG build artifact exists.
- app can read a fresh `ORBIT_HOME`.

Commands should be added once packaging is introduced:

```bash
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop package:dir
pnpm --filter @orbit/desktop package:dmg
```

## Alpha Quality Gates

Required before Alpha:

- `pnpm lint`
- `pnpm test`
- `pnpm typecheck`
- `pnpm --filter @orbit/desktop typecheck`
- `pnpm --filter @orbit/desktop build`
- Electron E2E launch/navigation smoke.
- Adapter golden tests on sanitized realistic fixtures.
- Review/governance transition tests.
- Re-index idempotency tests.

## Test Data Rules

- Tests must not depend on private local user data.
- Realistic fixtures must be sanitized and committed only after manual review.
- `.tmp/private-samples` must remain ignored.
- Default test output must not print raw private payloads.
