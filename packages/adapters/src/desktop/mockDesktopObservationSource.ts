import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ObservationInput } from "@orbit/core";
import { sortObservationInputs } from "@orbit/core";

export interface MockObservationReadResult {
  inputs: ObservationInput[];
  nextCursor: string;
  warnings: string[];
}

export interface ObservationQueueLike {
  readonly paused: boolean;
  enqueue(input: ObservationInput): void;
}

export interface MockObservationEmitResult {
  read: number;
  emitted: number;
  skipped: number;
  nextCursor: string;
  warnings: string[];
}

export class MockDesktopObservationSource {
  constructor(
    private readonly inputs: ObservationInput[],
    private readonly warnings: string[] = []
  ) {}

  static fromDirectory(directory: string): MockDesktopObservationSource {
    const result = readDesktopObservationFixtures(directory);
    return new MockDesktopObservationSource(result.inputs, result.warnings);
  }

  readCursor(cursor?: string): MockObservationReadResult {
    const sorted = sortObservationInputs(this.inputs);
    const start = cursor ? Number.parseInt(cursor, 10) : 0;
    const safeStart = Number.isFinite(start) && start > 0 ? start : 0;
    return {
      inputs: sorted.slice(safeStart),
      nextCursor: String(sorted.length),
      warnings: [...this.warnings]
    };
  }

  emitToQueue(queue: ObservationQueueLike, cursor?: string): MockObservationEmitResult {
    const result = this.readCursor(cursor);
    if (queue.paused) {
      return {
        read: result.inputs.length,
        emitted: 0,
        skipped: result.inputs.length,
        nextCursor: cursor ?? "0",
        warnings: [...result.warnings, "Mock observation source is paused."]
      };
    }
    for (const input of result.inputs) {
      queue.enqueue(input);
    }
    return {
      read: result.inputs.length,
      emitted: result.inputs.length,
      skipped: 0,
      nextCursor: result.nextCursor,
      warnings: result.warnings
    };
  }
}

export function readDesktopObservationFixtures(directory: string): {
  inputs: ObservationInput[];
  warnings: string[];
} {
  if (!existsSync(directory)) {
    return { inputs: [], warnings: [`Desktop observation fixture directory not found: ${directory}`] };
  }

  const warnings: string[] = [];
  const inputs = readdirSync(directory)
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
          const input = JSON.parse(line) as ObservationInput;
          validateObservationInput(input, `${file}#${index + 1}`);
          return [input];
        } catch (error) {
          warnings.push(
            `Skipped malformed desktop observation fixture ${file}#${index + 1}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          return [];
        }
      });
    });

  return { inputs: sortObservationInputs(inputs), warnings };
}

function validateObservationInput(input: ObservationInput, pointer: string): void {
  if (!input.type) throw new Error(`${pointer} is missing type`);
  if (!input.tier) throw new Error(`${pointer} is missing tier`);
  if (!input.sourceKind) throw new Error(`${pointer} is missing sourceKind`);
  if (!input.occurredAt) throw new Error(`${pointer} is missing occurredAt`);
  if (!input.runtimeSessionId) throw new Error(`${pointer} is missing runtimeSessionId`);
  if (!Number.isFinite(input.sequence)) throw new Error(`${pointer} is missing sequence`);
}
