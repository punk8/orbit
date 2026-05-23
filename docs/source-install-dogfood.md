# Source Install Dogfood Guide

This guide is for trusted technical users who clone Orbit, build it locally, grant macOS Screen
Recording permission, and run the source-install dogfood build for daily work. The execution authority
for the current development cycle remains
[docs/source-install-dogfood-production-spec.md](./source-install-dogfood-production-spec.md).

This is not a public distribution release. It does not cover notarized public downloads, auto-update,
cloud sync, payment, accounts, hosted support, or broad telemetry. Raw screenshots, raw OCR dumps,
microphone, system audio, arbitrary filesystem scanning, browser scraping, keystroke capture, and
external AI uploads remain off by default.

## Environment Requirements

- macOS 14 Sonoma or newer is the expected dogfood runtime. Earlier macOS versions are not part of
  this source-install gate.
- Node.js 22 or newer, matching the root `package.json` engine.
- pnpm 10.14.0, matching the root `packageManager`.
- Xcode Command Line Tools for native rebuild and packaged helper paths:
  `xcode-select --install`.
- macOS Screen Recording permission for the built Orbit app before Screen/OCR can observe.
- A repo-local `ORBIT_HOME` for verification and dogfood data. Recommended:

```bash
export ORBIT_HOME="$PWD/.tmp/source-install-dogfood"
mkdir -p "$ORBIT_HOME"
```

Keep `ORBIT_HOME` under the cloned repository for smoke and release-gate commands. Do not use
`/tmp/orbit-dogfood-clean`.

## Install And Verify

From a clean clone:

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop package:dir
pnpm --filter @orbit/desktop package:smoke
ORBIT_HOME="$PWD/.tmp/source-install-release-gate" pnpm --filter @orbit/cli orbit perception release-gate --json
```

The one-command safe non-interactive gate is:

```bash
pnpm source-install:verify
```

It runs tests, typecheck, lint, desktop build, packaged directory build, packaged smoke, and the CLI
release gate with `ORBIT_HOME="$PWD/.tmp/source-install-release-gate"`.

## Runtime hardening status

The menu bar, Settings, CLI status, and release gate expose the same source-install runtime hardening
map. Each entry has a user-visible state, root reason, next action, and audit coverage so trusted
dogfood users can recover locally without guessing.

| Failure kind | Expected state | Next action |
| --- | --- | --- |
| `helper_missing` | Error | Rebuild/package again and rerun `pnpm --filter @orbit/desktop package:smoke`. |
| `helper_timeout` | Error | Retry after checking Screen/OCR helper health and packaged helper permissions. |
| `permission_missing` | Needs permission | Grant macOS Screen Recording to the Orbit app that is currently running. |
| `permission_revoked` | Needs permission | Re-grant Screen Recording and confirm Orbit returns to observing only when not paused/stopped/disabled. |
| `protected_context` | Protected | Leave the protected app/window/domain or adjust protected rules deliberately. |
| `resource_paused` | Paused by resource policy | Reduce resource pressure or wait for the scheduler to resume. |
| `sqlite_lock` | Error | Stop other Orbit processes using the same `ORBIT_HOME`, then retry with a repo-local home. |
| `native_abi_mismatch` | Error | Run Electron and Node native rebuilds so `better-sqlite3` matches the active runtime ABI. |
| `storage_cap_reached` | Paused by resource policy | Run cleanup or increase the local storage budget before continuing observation. |

This source-install dogfood path is intentionally not a notarized public distribution. It does not
cover notarized public distribution, auto-update, cloud sync, hosted support, or broad telemetry.

## Run The Desktop App

For development:

```bash
ORBIT_HOME="$PWD/.tmp/source-install-dogfood" pnpm --filter @orbit/desktop dev
```

For a packaged app built from source:

```bash
pnpm --filter @orbit/desktop package:dir
open apps/desktop/release/mac-arm64/Orbit.app
```

After granting Screen Recording permission in macOS System Settings, Orbit should automatically enter
low-frequency Screen/OCR observing unless the user has paused, stopped, disabled the source, entered a
protected context, or hit a resource pause condition. Use the menu bar, Settings, and CLI status to
confirm the visible runtime state:

```bash
ORBIT_HOME="$PWD/.tmp/source-install-dogfood" pnpm --filter @orbit/cli orbit perception status --json
```

## Native Rebuild Recovery

The desktop build switches `better-sqlite3` between Node and Electron ABIs. If a process is killed
during this step, run both rebuilds explicitly:

```bash
pnpm --filter @orbit/desktop rebuild:native:electron
pnpm --filter @orbit/desktop rebuild:native:node
```

If the rebuild lock is stale, remove only the repo-local lock after confirming no rebuild command is
running:

```bash
rm -f apps/desktop/node_modules/.cache/orbit-native-rebuild.lock
```

## Troubleshooting

### Native module ABI mismatch

Symptoms include `NODE_MODULE_VERSION`, `better-sqlite3`, or Electron startup errors. Run:

```bash
pnpm --filter @orbit/desktop rebuild:native:electron
pnpm --filter @orbit/desktop build
pnpm --filter @orbit/desktop rebuild:native:node
```

### Killed native rebuild lock

If a previous rebuild was interrupted, package/build commands may wait on
`orbit-native-rebuild.lock`. Confirm no rebuild is active, then remove:

```bash
rm -f apps/desktop/node_modules/.cache/orbit-native-rebuild.lock
```

### Missing Screen Recording permission

Open macOS System Settings, grant Screen Recording to the Orbit app you are running, then restart
Orbit if macOS asks for it. Verify:

```bash
ORBIT_HOME="$PWD/.tmp/source-install-dogfood" pnpm --filter @orbit/cli orbit perception status --json
```

### Packaged helper missing

Run the packaged build and smoke check again:

```bash
pnpm --filter @orbit/desktop package:dir
pnpm --filter @orbit/desktop package:smoke
```

The smoke check verifies the packaged Screen/OCR helper path and scans for private/raw fixture data in
the packaged output.

### SQLite lock

Stop all Orbit desktop and CLI processes using the same `ORBIT_HOME`, then retry the command. For
source-install verification, prefer a fresh repo-local home:

```bash
ORBIT_HOME="$PWD/.tmp/source-install-release-gate" pnpm --filter @orbit/cli orbit perception release-gate --json
```

### Stale ORBIT_HOME

If old dogfood data is confusing a verification run, move the repo-local home aside instead of
deleting arbitrary filesystem paths:

```bash
mv "$PWD/.tmp/source-install-dogfood" "$PWD/.tmp/source-install-dogfood.prev.$(date +%Y%m%d%H%M%S)"
mkdir -p "$PWD/.tmp/source-install-dogfood"
```

Use Orbit cleanup commands for raw sidecars and source-derived data once the app is running.
