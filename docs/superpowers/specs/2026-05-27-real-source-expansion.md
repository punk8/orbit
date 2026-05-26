# Real Source Expansion Spec

Date: 2026-05-27

## Goal

Expand Orbit beyond one-shot Screen/OCR and Codex import by adding explicit, local, read-only source paths for local agents, project directories, browser metadata, terminal events, and file activity, while preserving consent, privacy, and export boundaries.

## User Problem

普通用户自助使用需要 Orbit 能读到真实工作现场，而不是只依赖 fixtures 或单个 Codex JSONL。At the same time, users must know exactly what is read, what is stored, and what is excluded from AI/Handoff.

## Source Families

### Local Agent Sessions

Already supported by `LocalAgentAdapter`; improve setup copy and validation.

```ts
setupKind: "local_agent"
path: "/Users/me/.claude/projects/orbit" // explicit user-selected directory/file
mode: "import_only" initially
```

### Project Directory

Explicit user-selected project root. First checkpoint should capture metadata only:

- Git branch/status summary if available.
- Changed file paths, extensions, and timestamps.
- Project name/repository path.
- No arbitrary file content indexing by default.

Pseudo-adapter:

```ts
class ProjectDirectoryAdapter implements SourceAdapter {
  permissionScope = {
    readableFields: ["file path", "mtime", "git status", "project"],
    canStoreRaw: false,
    canStoreSummary: true,
    canUseForAI: true,
    canExportToAgent: true,
    retentionPolicyId: "project_metadata_90d"
  };

  async readCursor(cursor) {
    const files = listGitChangedFiles(root).filter(matchesAllowlist);
    return {
      events: files.map((file, index) => normalizeObservationInput({
        type: "file_activity",
        tier: "tier2",
        sourceKind: "filesystem",
        runtimeSessionId,
        sequence: index + 1,
        occurredAt: file.mtime,
        file: {
          rootId: projectId,
          relativePath: file.relativePath,
          operation: file.operation,
          contentHash: file.hash
        }
      })),
      nextCursor: latestSeenMtime
    };
  }
}
```

### Browser Metadata

First checkpoint supports explicit import of sanitized browser navigation JSON, not silent browser scraping.

```json
[
  {
    "occurredAt": "2026-05-27T09:20:00.000Z",
    "app": "Chrome",
    "url": "https://docs.example.com/prd",
    "title": "PRD - Orbit",
    "profileId": "work"
  }
]
```

Adapter uses `BrowserMetadataAdapter({ approvedPath: "explicit_import" })`.

### Terminal Events

First checkpoint supports explicit import of shell-integration/log summary JSON, not `.zsh_history` scraping by default.

```json
[
  {
    "occurredAt": "2026-05-27T09:30:00.000Z",
    "sessionId": "term-1",
    "cwd": "/Users/me/project/orbit",
    "command": "pnpm test",
    "exitCode": 0
  }
]
```

Adapter uses `TerminalObservationAdapter({ approvedPath: "explicit_log_import" })`.

### File Activity

First checkpoint supports explicit import of file activity JSON bound to allowed folders, not OS-wide filesystem watching.

```json
{
  "allowedFolders": [
    {
      "id": "orbit",
      "rootPath": "/Users/me/project/orbit",
      "displayName": "Orbit",
      "enabled": true,
      "includeGlobs": ["**/*"],
      "excludeGlobs": ["node_modules/**", "dist/**", ".git/**"],
      "defaultSensitivity": "internal"
    }
  ],
  "events": [
    {
      "occurredAt": "2026-05-27T09:35:00.000Z",
      "rootId": "orbit",
      "relativePath": "apps/desktop/src/App.tsx",
      "operation": "modified"
    }
  ]
}
```

Adapter uses `FileActivityAdapter` with explicit `allowedFolders`.

## UI Setup

Extend `SourceSetupKind`:

```ts
type SourceSetupKind =
  | "codex"
  | "local_agent"
  | "seatalk"
  | "project_directory"
  | "browser_import"
  | "terminal_import"
  | "file_activity_import";
```

Sources preview must show:

- Adapter display name.
- Import mode.
- Event count and warnings.
- Projects/apps/date range.
- Readable fields.
- Raw storage policy.
- AI/Handoff export eligibility.

Confirm remains explicit:

```ts
const preview = await previewSourceImport(kind, path);
renderPreview(preview);
await userClicksConfirm();
await confirmSourceImport(kind, path);
```

## Privacy Boundaries

- All new sources are import-only by default.
- Browser import stores URL/title only from user-provided sanitized export.
- Terminal import stores command and exit code only from explicit log import; no raw output by default.
- Project directory stores metadata only; no file contents by default.
- File activity import is bounded by allowed folders; no global filesystem scanning.
- Handoff includes only sources where `canExportToAgent=true`; raw payloads remain excluded.

## Tests

- Adapter tests for browser, terminal, file activity explicit import already exist and should be extended for input-file parsing.
- Desktop data tests verify preview does not write sources/events.
- Desktop data tests verify confirmed imports are `import_only` and skipped by background ingestion.
- SourcesPage source test verifies new setup kinds are visible and warning copy says explicit import.

## Acceptance

- User can preview and confirm a local agent path.
- User can preview and confirm one safe explicit browser/terminal/file activity import.
- Project directory source reports file metadata without reading arbitrary file contents.
- Background ingestion skips import-only sources.
- Commands: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm --filter @orbit/desktop build`.
