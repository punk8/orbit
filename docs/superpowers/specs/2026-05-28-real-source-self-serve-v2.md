# Real Source Self-Serve V2 Spec

Date: 2026-05-28

## Goal

Help ordinary users configure real local sources without guessing input formats, while keeping every new source explicit, local, preview-first, and import-only.

## User Problem

The first source expansion added local agent, project directory, browser metadata, terminal events, and file activity imports. A self-serve user still needs concrete guidance on which path to choose and what sanitized JSON shape Orbit expects before preview succeeds.

## Scope

- Add source-kind-specific setup guidance in Sources.
- Show the expected path type: file or folder.
- Show a compact sample schema for browser, terminal, and file activity imports.
- Clarify project directory reads metadata only.
- Keep preview and confirm as separate explicit actions.

## Non-Goals

- No silent browser scraping.
- No `.zsh_history` scraping by default.
- No arbitrary file content indexing.
- No background watcher for filesystem events.
- No external provider call during preview.

## Source Guidance Model

Renderer-only helper:

```ts
interface SourceImportGuide {
  pathType: "folder" | "file";
  summaryKey: TranslationKey;
  sample?: string;
}

function sourceImportGuide(kind: SourceSetupKind, t): SourceImportGuide {
  if (kind === "project_directory") {
    return {
      pathType: "folder",
      summaryKey: "source.guide.projectDirectory"
    };
  }
  if (kind === "browser_import") {
    return {
      pathType: "file",
      summaryKey: "source.guide.browser",
      sample: `[{ "occurredAt": "...", "app": "Chrome", "url": "https://...", "title": "..." }]`
    };
  }
}
```

Render the guide under the import type selector:

```tsx
const guide = sourceImportGuide(importKind, t);

<div className="source-import-guide">
  <strong>{sourceImportPathTypeLabel(guide.pathType)}</strong>
  <p>{t(guide.summaryKey)}</p>
  {guide.sample ? <code>{guide.sample}</code> : null}
</div>
```

## UI Requirements

- Codex/local agent/SeaTalk/project directory guide says folder unless a file path is also accepted by adapter.
- Browser/terminal/file activity guides say sanitized JSON file.
- Project directory guide says changed file path, mtime, git status, and hash metadata only; no file contents by default.
- Browser guide says URL/title/profile metadata only; no cookies, DOM, page body, or silent scraping.
- Terminal guide says command/cwd/exit code only; no raw output by default.
- File activity guide says events must be bounded by `allowedFolders`.

## Privacy Boundaries

- Guide text must not encourage importing secrets, raw terminal output, full browser histories, cookies, DOM, screenshots, or arbitrary document bodies.
- Preview still performs no writes.
- Confirm remains explicit and import-only.

## Tests

- `SourcesPage.test.ts` checks guide helper, path type labels, samples, and privacy copy.
- Existing desktop data tests continue verifying preview does not write and confirmed imports are import-only.

## Acceptance

- A user can select browser import and see the expected sanitized JSON shape before choosing a file.
- A user can select project directory and see that only metadata is read.
- Preview/confirm remain separate actions.
- Commands: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm --filter @orbit/desktop build`, `pnpm --filter @orbit/desktop package:dir`.
