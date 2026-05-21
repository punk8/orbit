import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ScreenCaptureFrame } from "./screenCaptureTypes";

export interface ScreenCaptureFixtureReadResult {
  frames: ScreenCaptureFrame[];
  warnings: string[];
}

export function readScreenCaptureFixtures(directory: string): ScreenCaptureFixtureReadResult {
  if (!existsSync(directory)) {
    return { frames: [], warnings: [`Screen/OCR fixture directory not found: ${directory}`] };
  }

  const warnings: string[] = [];
  const frames = readdirSync(directory)
    .filter((file) => file.endsWith(".jsonl"))
    .sort()
    .flatMap((file) => {
      const filePath = join(directory, file);
      const lines = readFileSync(filePath, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      return lines.flatMap((line, index) => {
        try {
          const frame = JSON.parse(line) as ScreenCaptureFrame;
          validateFrame(frame, `${file}#${index + 1}`);
          return [frame];
        } catch (error) {
          warnings.push(
            `Skipped malformed screen/OCR fixture ${file}#${index + 1}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          return [];
        }
      });
    })
    .sort((a, b) => {
      const byTime = a.capturedAt.localeCompare(b.capturedAt);
      return byTime === 0 ? a.sequence - b.sequence : byTime;
    });

  return { frames, warnings };
}

function validateFrame(frame: ScreenCaptureFrame, pointer: string): void {
  if (!frame.id) throw new Error(`${pointer} is missing id`);
  if (!frame.capturedAt) throw new Error(`${pointer} is missing capturedAt`);
  if (!frame.runtimeSessionId) throw new Error(`${pointer} is missing runtimeSessionId`);
  if (!Number.isFinite(frame.sequence)) throw new Error(`${pointer} is missing sequence`);
  if (!frame.scope?.kind) throw new Error(`${pointer} is missing scope.kind`);
  if (!frame.scope?.label) throw new Error(`${pointer} is missing scope.label`);
  if (!frame.frameHash) throw new Error(`${pointer} is missing frameHash`);
}
