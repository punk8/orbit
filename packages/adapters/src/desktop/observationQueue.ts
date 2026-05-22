import type {
  EventWriter,
  ObservationDrainResult,
  ObservationInput,
  ObservationInputDeduperOptions,
  ProtectedAppRule
} from "@orbit/core";
import {
  DESKTOP_OBSERVATION_ADAPTER_ID,
  ingestEventsFromAdapter,
  ObservationInputDeduper
} from "@orbit/core";
import { DesktopObservationAdapter } from "./desktopObservationAdapter";

export interface InProcessObservationQueueOptions {
  adapterId?: string;
  maxItems?: number;
  protectedApps?: ProtectedAppRule[];
  dedupeWindowMs?: number;
}

export class InProcessObservationQueue {
  private readonly maxItems: number;
  private readonly adapterId: string;
  private readonly protectedApps: ProtectedAppRule[] | undefined;
  private readonly deduper: ObservationInputDeduper;
  private items: ObservationInput[] = [];
  private dropped = 0;
  private warnings: string[] = [];
  paused = false;

  constructor(options: InProcessObservationQueueOptions = {}) {
    this.maxItems = options.maxItems ?? 1000;
    this.adapterId = options.adapterId ?? DESKTOP_OBSERVATION_ADAPTER_ID;
    this.protectedApps = options.protectedApps;
    const deduperOptions: ObservationInputDeduperOptions = {};
    if (options.dedupeWindowMs !== undefined) {
      deduperOptions.dedupeWindowMs = options.dedupeWindowMs;
    }
    if (options.protectedApps !== undefined) {
      deduperOptions.protectedApps = options.protectedApps;
    }
    this.deduper = new ObservationInputDeduper(deduperOptions);
  }

  get depth(): number {
    return this.items.length;
  }

  enqueue(input: ObservationInput): void {
    if (this.paused) return;
    const accepted = this.deduper.accept(input);
    if (!accepted.accepted) {
      this.warnings.push(`Deduped desktop ${input.type} observation.`);
      return;
    }
    if (accepted.suppressed) {
      this.warnings.push(`Suppressed protected desktop ${input.type} observation.`);
    }
    if (this.items.length >= this.maxItems) {
      this.dropRawPayloads();
    }
    if (this.items.length >= this.maxItems) {
      this.dropped += 1;
      this.warnings.push(`Observation queue is full; dropped ${input.type}#${input.sequence}.`);
      return;
    }
    this.items.push(stripTransientRaw(accepted.input));
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
    this.deduper.reset();
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
