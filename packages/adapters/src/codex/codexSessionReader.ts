import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

export interface CodexSessionItem {
  raw: unknown;
  pointer: string;
  filePath: string;
  position: number;
}

export function readCodexSessionItems(inputPath: string): CodexSessionItem[] {
  if (!existsSync(inputPath)) {
    return [];
  }

  const files = statSync(inputPath).isDirectory()
    ? collectSessionFiles(inputPath)
    : [inputPath].filter(isSessionFile);

  return files.flatMap((filePath) => readSessionFile(inputPath, filePath));
}

function collectSessionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectSessionFiles(entryPath);
      }
      return isSessionFile(entryPath) ? [entryPath] : [];
    })
    .sort();
}

function isSessionFile(path: string): boolean {
  return path.endsWith(".jsonl") || path.endsWith(".json");
}

function readSessionFile(rootPath: string, filePath: string): CodexSessionItem[] {
  const content = readFileSync(filePath, "utf8").trim();
  if (!content) {
    return [];
  }

  if (filePath.endsWith(".jsonl")) {
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => ({
        raw: JSON.parse(line) as unknown,
        pointer: `codex://${relativePointer(rootPath, filePath)}#${index + 1}`,
        filePath,
        position: index + 1
      }));
  }

  const parsed = JSON.parse(content) as unknown;
  const records = Array.isArray(parsed) ? parsed : [parsed];
  return records.map((raw, index) => ({
    raw,
    pointer: `codex://${relativePointer(rootPath, filePath)}#${index + 1}`,
    filePath,
    position: index + 1
  }));
}

function relativePointer(rootPath: string, filePath: string): string {
  if (rootPath === filePath) {
    return basename(filePath);
  }
  return relative(rootPath, filePath) || basename(filePath);
}
