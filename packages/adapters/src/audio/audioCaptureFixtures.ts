import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AudioSegment } from "./audioCaptureTypes";

export interface AudioFixtureReadResult {
  segments: AudioSegment[];
  warnings: string[];
}

export function readAudioFixtures(directory: string): AudioFixtureReadResult {
  if (!existsSync(directory)) {
    return { segments: [], warnings: [`Audio fixture directory not found: ${directory}`] };
  }

  const warnings: string[] = [];
  const segments = readdirSync(directory)
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
          const segment = JSON.parse(line) as AudioSegment;
          validateSegment(segment, `${file}#${index + 1}`);
          return [segment];
        } catch (error) {
          warnings.push(
            `Skipped malformed audio fixture ${file}#${index + 1}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          return [];
        }
      });
    })
    .sort((a, b) => {
      const byTime = a.startedAt.localeCompare(b.startedAt);
      return byTime === 0 ? a.sequence - b.sequence : byTime;
    });

  return { segments, warnings };
}

function validateSegment(segment: AudioSegment, pointer: string): void {
  if (!segment.id) throw new Error(`${pointer} is missing id`);
  if (!segment.startedAt) throw new Error(`${pointer} is missing startedAt`);
  if (!segment.endedAt) throw new Error(`${pointer} is missing endedAt`);
  if (!segment.runtimeSessionId) throw new Error(`${pointer} is missing runtimeSessionId`);
  if (!Number.isFinite(segment.sequence)) throw new Error(`${pointer} is missing sequence`);
  if (!segment.scope?.kind) throw new Error(`${pointer} is missing scope.kind`);
  if (!segment.scope?.label) throw new Error(`${pointer} is missing scope.label`);
  if (!segment.segmentHash) throw new Error(`${pointer} is missing segmentHash`);
  if (!Number.isFinite(segment.durationMs)) throw new Error(`${pointer} is missing durationMs`);
}
