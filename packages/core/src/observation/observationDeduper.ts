import type { ObservationInput, ProtectedAppRule } from "./observationTypes";
import { isProtectedObservation } from "./observationPolicy";
import { observationDedupKey } from "./normalizeObservation";

export interface ObservationInputDeduperOptions {
  dedupeWindowMs?: number;
  protectedApps?: ProtectedAppRule[];
}

export type ObservationInputAcceptResult =
  | {
      accepted: true;
      input: ObservationInput;
      dedupKey: string;
      suppressed: boolean;
    }
  | {
      accepted: false;
      reason: "duplicate";
      dedupKey: string;
      previousAt: string;
      suppressed: boolean;
    };

export class ObservationInputDeduper {
  private readonly dedupeWindowMs: number;
  private readonly protectedApps: ProtectedAppRule[] | undefined;
  private readonly lastAcceptedAtByKey = new Map<string, string>();

  constructor(options: ObservationInputDeduperOptions = {}) {
    this.dedupeWindowMs = options.dedupeWindowMs ?? 30_000;
    this.protectedApps = options.protectedApps;
  }

  accept(input: ObservationInput): ObservationInputAcceptResult {
    const suppressed = isProtectedObservation(input, this.protectedApps);
    const sanitized = sanitizeObservationInput(input, this.protectedApps);
    const dedupKey = observationDedupKey(sanitized, sanitized.type, suppressed);
    const previousAt = this.lastAcceptedAtByKey.get(dedupKey);
    if (previousAt && withinDedupeWindow(previousAt, sanitized.occurredAt, this.dedupeWindowMs)) {
      return {
        accepted: false,
        reason: "duplicate",
        dedupKey,
        previousAt,
        suppressed
      };
    }
    this.lastAcceptedAtByKey.set(dedupKey, sanitized.occurredAt);
    return {
      accepted: true,
      input: sanitized,
      dedupKey,
      suppressed
    };
  }

  reset(): void {
    this.lastAcceptedAtByKey.clear();
  }
}

export function sanitizeObservationInput(
  input: ObservationInput,
  protectedApps?: ProtectedAppRule[]
): ObservationInput {
  const protectedApp = isProtectedObservation(input, protectedApps);
  const next: ObservationInput = {
    ...input
  };
  if (input.app) next.app = { ...input.app };
  if (input.window) next.window = { ...input.window };
  if (next.raw) delete next.raw;
  if (!protectedApp) return stripUndefined(next);

  next.type = "app_focus";
  next.app = {
    ...(next.app ?? { name: "Protected app" }),
    isProtected: true
  };
  delete next.window;
  delete next.browser;
  delete next.terminal;
  delete next.clipboard;
  delete next.file;
  delete next.accessibility;
  delete next.screen;
  delete next.ocr;
  delete next.audio;
  delete next.transcript;
  return stripUndefined(next);
}

function withinDedupeWindow(previousAt: string, nextAt: string, dedupeWindowMs: number): boolean {
  const previous = new Date(previousAt).getTime();
  const next = new Date(nextAt).getTime();
  if (Number.isNaN(previous) || Number.isNaN(next)) return false;
  return next - previous >= 0 && next - previous <= dedupeWindowMs;
}

function stripUndefined(input: ObservationInput): ObservationInput {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as
    ObservationInput;
}
