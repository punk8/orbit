# Alpha Runtime Decisions

## Target

Orbit Alpha means a small number of users can install and run the app on their own machines with explicit local data sources. It is not just developer dogfood.

## Packaging Decision

Alpha should not rely only on `dev` or renderer `build` commands.

Use three runtime levels:

1. **Development**: `pnpm --filter @orbit/desktop dev` and CLI commands for fast iteration.
2. **Local app smoke**: package an unpacked `.app` or `dir` target for launch testing.
3. **Alpha distribution**: produce `.dmg` plus `.zip` artifacts.

Rationale:

- `dev/build` is enough for engineering, but it is not a user-installable Alpha.
- `dir`/unpacked app is useful for debugging packaging without installer overhead.
- `.dmg` is the standard macOS user-facing distribution format; `.zip` should be built alongside it if auto-update is later enabled.
- Signing and notarization should become a release gate before distributing beyond trusted internal testers.

References:

- Electron Builder macOS target docs: `https://www.electron.build/docs/mac/`
- Electron Builder target selection docs: `https://www.electron.build/docs/targets/`

## Configurable Runtime Features

### Menu Bar Residency

Make menu bar residency configurable.

Default for Alpha: **enabled**.

Required behavior:

- Keep a Tray/menu bar icon alive while the app is running.
- Allow users to open the main window, pause ingestion, run re-index, and quit from the menu.
- If disabled, Orbit behaves like a regular windowed app.

Implementation note:

- Electron Tray on macOS appears in the menu bar extras area.
- Keep a global reference to the Tray object to avoid garbage collection.

### Launch At Login

Make launch-at-login configurable.

Default for Alpha: **disabled** until users opt in.

Required behavior:

- Settings toggle writes the login item preference.
- UI reflects the current system setting when possible.
- Orbit must be able to launch hidden/minimized only after a later explicit UX decision.

Implementation note:

- Use Electron `app.setLoginItemSettings`.
- macOS 13+ has specific login item service behavior; keep this code isolated behind a platform runtime module.

### Database Path

Make the database path configurable.

Default for Alpha: `~/Library/Application Support/Orbit/orbit.db`.

Required behavior:

- Settings shows current `ORBIT_HOME` and DB path.
- Users can pick a new data directory.
- Changing DB location should require restart unless a safe live migration flow is implemented.
- Provide an explicit migration/copy action rather than silently moving data.

### First-Run Source Setup

Do not hard-code Codex as the only source.

Required behavior:

- First launch shows source setup if no enabled source exists.
- Source options are generic:
  - Codex local sessions
  - Claude/Claude Code local sessions
  - generic agent session import
  - approved SeaTalk import
  - synthetic fixtures for demo/testing
- Every source path must be explicitly selected or provided by the user.

Implication:

- The data model should add or support a generic local agent source rather than forcing Claude data through `codex`.

### Data Operations

Alpha Settings must provide these local operations:

- Re-index derived objects from existing Events.
- Clear local data with a confirmation boundary.
- Export context for a selected date/project.
- Export audit/debug bundle without private raw payloads by default.

Do not add destructive delete UI until the backend use cases and audit logs are tested.

## Non-Goals For Alpha Runtime

- Cloud sync.
- Hosted backend.
- Screen recording/OCR.
- Automatic message sending.
- Automatic code changes or external task creation.
- Silent ingestion from unapproved paths.
