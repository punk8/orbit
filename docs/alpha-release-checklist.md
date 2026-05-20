# Alpha Release Checklist

Orbit Alpha packaging is intentionally local-first and unsigned unless signing credentials are explicitly provided.

## Required Gates

- `pnpm test`
- `pnpm typecheck`
- `pnpm --filter @orbit/desktop build`
- `pnpm --filter @orbit/desktop package:dir`
- `pnpm --filter @orbit/desktop test:e2e`
- `pnpm --filter @orbit/desktop package:dmg`

## Artifact Policy

- Alpha artifacts are built under `apps/desktop/release`.
- `.tmp` private samples and fixture directories must not be packaged.
- The DMG target is configured for local Alpha distribution.
- Current Alpha artifacts are unsigned and not notarized: `identity: null`, `dmg.sign: false`.
- Packaging rebuilds native modules for Electron. If Node/Vitest later reports a `better-sqlite3` ABI mismatch, run `pnpm rebuild better-sqlite3` before continuing development tests.

## Signing And Notarization Gate

Before broader distribution:

- Provide Apple Developer Team ID and signing certificate.
- Enable hardened runtime.
- Add notarization credentials through CI secrets or local keychain.
- Verify Gatekeeper behavior on a clean macOS user account.
- Update this checklist with the final signed artifact command.
