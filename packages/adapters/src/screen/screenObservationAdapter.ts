import type {
  AdapterReadAuditEntry,
  AdapterReadResult,
  ObservationInput,
  ObservationPermissionStatus,
  PermissionScope,
  ProtectedAppRule,
  Sensitivity,
  SourceAdapter
} from "@orbit/core";
import {
  DEFAULT_RAW_FRAME_TTL_MINUTES,
  getProtectedObservationMatch,
  normalizeObservationInputs,
  perceptionRawRetentionPolicyId
} from "@orbit/core";
import { existsSync, unlinkSync } from "node:fs";
import { isAbsolute } from "node:path";
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
  canUseForAI?: boolean;
  canExportToAgent?: boolean;
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
      canUseForAI: options.canUseForAI ?? false,
      canExportToAgent: options.canExportToAgent ?? false,
      retentionPolicyId: options.allowRawFrameStorage
        ? perceptionRawRetentionPolicyId(
            options.rawRetentionTtlMinutes ?? DEFAULT_RAW_FRAME_TTL_MINUTES
          )
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
    const audit: AdapterReadAuditEntry[] = [];
    const inputs: ObservationInput[] = [];
    const seenFrameHashes = new Set<string>();

    for (const frame of selected) {
      if (!scopeAllowsFrame(frame, this.options.scope)) {
        warnings.push(
          `Skipped screen frame ${frame.id}; outside selected ${this.options.scope.kind} scope.`
        );
        continue;
      }
      if (seenFrameHashes.has(frame.frameHash)) {
        warnings.push(`Suppressed duplicate screen frame ${frame.id}.`);
        continue;
      }
      seenFrameHashes.add(frame.frameHash);
      const input = frameToScreenObservationInput(
        frame,
        this.options.allowRawFrameStorage ?? false,
        this.options.rawRetentionTtlMinutes ?? DEFAULT_RAW_FRAME_TTL_MINUTES
      );
      const protectedMatch = getProtectedObservationMatch(input, this.options.protectedApps);
      if (protectedMatch) {
        deleteProtectedRawFrameSidecar(frame);
        warnings.push(`Suppressed protected screen frame ${frame.id}.`);
        audit.push({
          operation: "perception.protected_content_dropped",
          protectedRuleId: protectedMatch.ruleId,
          protectedReason: protectedMatch.reason,
          protectedContentDropped: 1
        });
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
      warnings,
      ...(audit.length > 0 ? { audit } : {})
    };
  }
}

export function frameToScreenObservationInput(
  frame: ScreenCaptureFrame,
  allowRawFrameStorage = false,
  rawRetentionTtlMinutes = DEFAULT_RAW_FRAME_TTL_MINUTES
): ObservationInput {
  const rawFrameStored = allowRawFrameStorage && Boolean(frame.rawLocalRef);
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
      ...(rawFrameStored && frame.rawLocalRef ? { rawLocalRef: frame.rawLocalRef } : {}),
      ...(rawFrameStored && frame.sizeBytes ? { sizeBytes: frame.sizeBytes } : {}),
      ...(rawFrameStored
        ? {
            rawRetentionTtlMinutes,
            rawFrameExpiresAt: addMinutes(frame.capturedAt, rawRetentionTtlMinutes),
            protectionStatus: "allowed" as const,
            cleanupState: "retained" as const
          }
        : {})
    },
    ...(rawFrameStored && frame.rawLocalRef
      ? {
          raw: {
            localRef: frame.rawLocalRef,
            ...(frame.sizeBytes ? { sizeBytes: frame.sizeBytes } : {})
          }
        }
      : {})
  };
}

export function screenFrameRetentionMetadata(
  frame: ScreenCaptureFrame,
  rawRetentionTtlMinutes = DEFAULT_RAW_FRAME_TTL_MINUTES
): Record<string, unknown> {
  const retentionPolicyId = perceptionRawRetentionPolicyId(rawRetentionTtlMinutes);
  return {
    capturedAt: frame.capturedAt,
    retentionPolicyId,
    rawFrameExpiresAt: addMinutes(frame.capturedAt, rawRetentionTtlMinutes),
    rawFrameState: "available",
    rawFrameLocalRef: frame.rawLocalRef,
    rawFrameSizeBytes: frame.sizeBytes,
    protectionStatus: "allowed",
    cleanupState: "retained"
  };
}

function addMinutes(timestamp: string, minutes: number): string {
  return new Date(new Date(timestamp).getTime() + minutes * 60_000).toISOString();
}

function deleteProtectedRawFrameSidecar(frame: ScreenCaptureFrame): void {
  if (!frame.rawLocalRef || !isAbsolute(frame.rawLocalRef) || !existsSync(frame.rawLocalRef)) return;
  unlinkSync(frame.rawLocalRef);
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
