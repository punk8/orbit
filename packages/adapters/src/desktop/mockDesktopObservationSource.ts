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
