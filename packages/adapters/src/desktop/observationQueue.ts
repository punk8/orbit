import type {
  EventWriter,
  ObservationDrainResult,
  ObservationInput,
  ProtectedAppRule
} from "@orbit/core";
import { DESKTOP_OBSERVATION_ADAPTER_ID, ingestEventsFromAdapter } from "@orbit/core";
import { DesktopObservationAdapter } from "./desktopObservationAdapter";

export interface InProcessObservationQueueOptions {
  adapterId?: string;
  maxItems?: number;
  protectedApps?: ProtectedAppRule[];
}

export class InProcessObservationQueue {
  private readonly maxItems: number;
  private readonly adapterId: string;
  private readonly protectedApps: ProtectedAppRule[] | undefined;
  private items: ObservationInput[] = [];
  private dropped = 0;
  private warnings: string[] = [];
  paused = false;

  constructor(options: InProcessObservationQueueOptions = {}) {
    this.maxItems = options.maxItems ?? 1000;
    this.adapterId = options.adapterId ?? DESKTOP_OBSERVATION_ADAPTER_ID;
    this.protectedApps = options.protectedApps;
  }

  get depth(): number {
    return this.items.length;
  }

  enqueue(input: ObservationInput): void {
    if (this.paused) return;
    if (this.items.length >= this.maxItems) {
      this.dropRawPayloads();
    }
    if (this.items.length >= this.maxItems) {
      this.dropped += 1;
      this.warnings.push(`Observation queue is full; dropped ${input.type}#${input.sequence}.`);
      return;
    }
    this.items.push(stripTransientRaw(input));
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  clear(): void {
    this.items = [];
    this.dropped = 0;
    this.warnings = [];
  }

  async drain(writer: EventWriter, maxItems = 50): Promise<ObservationDrainResult> {
    const batch = this.items.splice(0, maxItems);
    const adapterOptions = {
      inputs: batch,
      id: this.adapterId
    };
    const adapter = new DesktopObservationAdapter(
      this.protectedApps
        ? { ...adapterOptions, protectedApps: this.protectedApps }
        : adapterOptions
    );
    const result = await ingestEventsFromAdapter(adapter, writer);
    const drainWarnings = [...this.warnings, ...result.warnings];
    const output: ObservationDrainResult = {
      read: result.read,
      inserted: result.inserted,
      skipped: result.skipped,
      dropped: this.dropped,
      warnings: drainWarnings
    };
    if (result.lastEventAt) {
      output.lastEventAt = result.lastEventAt;
    }
    this.dropped = 0;
    this.warnings = [];
    return output;
  }

  private dropRawPayloads(): void {
    this.items = this.items.map(stripTransientRaw);
  }
}

function stripTransientRaw(input: ObservationInput): ObservationInput {
  if (!input.raw) return input;
  const next: ObservationInput = { ...input };
  delete next.raw;
  return next;
}
