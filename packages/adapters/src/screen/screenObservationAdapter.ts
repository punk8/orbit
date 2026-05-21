import type {
  AdapterReadResult,
  ObservationInput,
  ObservationPermissionStatus,
  PermissionScope,
  ProtectedAppRule,
  Sensitivity,
  SourceAdapter
} from "@orbit/core";
import { isProtectedObservation, normalizeObservationInputs } from "@orbit/core";
import { perceptionPermissionScope } from "../perception/perceptionAdapterPolicy";
import type { ScreenCaptureFrame, ScreenCaptureScope } from "./screenCaptureTypes";
import { screenPermission } from "./screenCaptureTypes";

export const SCREEN_OBSERVATION_ADAPTER_ID = "perception_screen";

export interface ScreenObservationAdapterOptions {
  frames: ScreenCaptureFrame[];
  scope: ScreenCaptureScope;
  id?: string;
  displayName?: string;
  defaultSensitivity?: Sensitivity;
  permission?: ObservationPermissionStatus;
  protectedApps?: ProtectedAppRule[];
  maxFramesPerRead?: number;
  allowRawFrameStorage?: boolean;
  rawRetentionTtlMinutes?: number;
}

export class ScreenObservationAdapter implements SourceAdapter {
  readonly id: string;
  readonly kind = "screen" as const;
  readonly displayName: string;
  readonly capabilities = ["incremental_read"] as const;
  readonly defaultSensitivity: Sensitivity;
  readonly permissionScope: PermissionScope;

  constructor(private readonly options: ScreenObservationAdapterOptions) {
    this.id = options.id ?? SCREEN_OBSERVATION_ADAPTER_ID;
    this.displayName = options.displayName ?? "Screen Observation";
    this.defaultSensitivity = options.defaultSensitivity ?? "confidential";
    this.permissionScope = perceptionPermissionScope(this.kind, {
      canStoreRaw: options.allowRawFrameStorage ?? false,
      retentionPolicyId: options.allowRawFrameStorage
        ? `perception_raw_ttl_${options.rawRetentionTtlMinutes ?? 60}m`
        : "perception_summary_only"
    });
  }

  async readCursor(cursor?: string): Promise<AdapterReadResult> {
    const permission = this.options.permission ?? screenPermission("not_determined");
    if (permission.status !== "granted" && permission.status !== "not_required") {
      return {
        events: [],
        nextCursor: cursor ?? "0",
        warnings: [`Screen observation needs Screen Recording permission: ${permission.status}`]
      };
    }

    const sorted = sortFrames(this.options.frames);
    const start = cursor ? Number.parseInt(cursor, 10) : 0;
    const safeStart = Number.isFinite(start) && start > 0 ? start : 0;
    const selected = sorted.slice(safeStart, safeStart + (this.options.maxFramesPerRead ?? 10));
    const warnings: string[] = [];
    const inputs: ObservationInput[] = [];

    for (const frame of selected) {
      if (!scopeAllowsFrame(frame, this.options.scope)) {
        warnings.push(
          `Skipped screen frame ${frame.id}; outside selected ${this.options.scope.kind} scope.`
        );
        continue;
      }
      const input = frameToScreenObservationInput(
        frame,
        this.options.allowRawFrameStorage ?? false
      );
      if (isProtectedObservation(input, this.options.protectedApps)) {
        warnings.push(`Suppressed protected screen frame ${frame.id}.`);
        continue;
      }
      inputs.push(input);
    }

    const normalizeOptions = this.options.protectedApps
      ? { adapterId: this.id, protectedApps: this.options.protectedApps }
      : { adapterId: this.id };

    return {
      events: normalizeObservationInputs(inputs, normalizeOptions),
      nextCursor: String(Math.min(sorted.length, safeStart + selected.length)),
      warnings
    };
  }
}

export function frameToScreenObservationInput(
  frame: ScreenCaptureFrame,
  allowRawFrameStorage = false
): ObservationInput {
  return {
    type: "screen_observation",
    tier: "tier3",
    sourceKind: "screen",
    occurredAt: frame.capturedAt,
    observedAt: frame.capturedAt,
    runtimeSessionId: frame.runtimeSessionId,
    sequence: frame.sequence,
    ...(frame.app ? { app: { ...frame.app } } : {}),
    ...(frame.window ? { window: { ...frame.window } } : {}),
    screen: {
      scopeKind: frame.scope.kind,
      scopeLabel: frame.scope.label,
      frameHash: frame.frameHash,
      ...(frame.width ? { width: frame.width } : {}),
      ...(frame.height ? { height: frame.height } : {}),
      ...(frame.redactedSummary ? { redactedSummary: frame.redactedSummary } : {}),
      ...(allowRawFrameStorage && frame.rawLocalRef ? { rawLocalRef: frame.rawLocalRef } : {}),
      ...(allowRawFrameStorage && frame.sizeBytes ? { sizeBytes: frame.sizeBytes } : {})
    }
  };
}

export function scopeAllowsFrame(frame: ScreenCaptureFrame, scope: ScreenCaptureScope): boolean {
  if (scope.kind === "display") {
    return scope.displayId ? frame.scope.displayId === scope.displayId : true;
  }
  if (scope.kind !== frame.scope.kind) return false;
  if (scope.windowId) return frame.scope.windowId === scope.windowId;
  if (scope.appBundleId) return frame.scope.appBundleId === scope.appBundleId;
  if (scope.appName) return normalize(frame.scope.appName) === normalize(scope.appName);
  return normalize(frame.scope.label) === normalize(scope.label);
}

function sortFrames(frames: ScreenCaptureFrame[]): ScreenCaptureFrame[] {
  return [...frames].sort((a, b) => {
    const byTime = a.capturedAt.localeCompare(b.capturedAt);
    return byTime === 0 ? a.sequence - b.sequence : byTime;
  });
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}
