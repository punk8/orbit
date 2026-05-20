import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

export interface CodexSessionItem {
  raw: unknown;
  pointer: string;
  filePath: string;
  position: number;
}

export interface SessionReadResult {
  items: CodexSessionItem[];
  warnings: string[];
}

export function readCodexSessionItems(inputPath: string): CodexSessionItem[] {
  return readSessionItems(inputPath, "codex").items;
}

export function readCodexSessionItemsWithWarnings(inputPath: string): SessionReadResult {
  return readSessionItems(inputPath, "codex");
}

export function readSessionItems(inputPath: string, pointerScheme: string): SessionReadResult {
  if (!existsSync(inputPath)) {
    return {
      items: [],
      warnings: [`Input path not found: ${inputPath}`]
    };
  }

  const files = statSync(inputPath).isDirectory()
    ? collectSessionFiles(inputPath)
    : [inputPath].filter(isSessionFile);

  const result: SessionReadResult = {
    items: [],
    warnings: []
  };
  for (const filePath of files) {
    const fileResult = readSessionFile(inputPath, filePath, pointerScheme);
    result.items.push(...fileResult.items);
    result.warnings.push(...fileResult.warnings);
  }
  return result;
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

function readSessionFile(
  rootPath: string,
  filePath: string,
  pointerScheme: string
): SessionReadResult {
  const content = readFileSync(filePath, "utf8").trim();
  if (!content) {
    return { items: [], warnings: [] };
  }

  if (filePath.endsWith(".jsonl")) {
    const result: SessionReadResult = { items: [], warnings: [] };
    content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line, index) => {
        const position = index + 1;
        try {
          result.items.push({
            raw: JSON.parse(line) as unknown,
            pointer: `${pointerScheme}://${relativePointer(rootPath, filePath)}#${position}`,
            filePath,
            position
          });
        } catch (error) {
          result.warnings.push(
            `Skipped invalid JSONL record at ${relativePointer(rootPath, filePath)}:${position}: ${
              error instanceof Error ? error.message : "unknown parse error"
            }`
          );
        }
      });
    return result;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    return {
      items: [],
      warnings: [
        `Skipped invalid JSON file ${relativePointer(rootPath, filePath)}: ${
          error instanceof Error ? error.message : "unknown parse error"
        }`
      ]
    };
  }
  const records = Array.isArray(parsed) ? parsed : [parsed];
  return {
    items: records.map((raw, index) => ({
      raw,
      pointer: `${pointerScheme}://${relativePointer(rootPath, filePath)}#${index + 1}`,
      filePath,
      position: index + 1
    })),
    warnings: []
  };
}

function relativePointer(rootPath: string, filePath: string): string {
  if (rootPath === filePath) {
    return basename(filePath);
  }
  return relative(rootPath, filePath) || basename(filePath);
}
