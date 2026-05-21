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
import type { AudioCaptureScope, AudioSegment } from "./audioCaptureTypes";
import { audioPermission } from "./audioCaptureTypes";
import { audioScopesMatch } from "./mockAudioCaptureNativeHelper";

export const AUDIO_OBSERVATION_ADAPTER_ID = "perception_audio";

export interface AudioObservationAdapterOptions {
  segments: AudioSegment[];
  scope: AudioCaptureScope;
  id?: string;
  displayName?: string;
  defaultSensitivity?: Sensitivity;
  permission?: ObservationPermissionStatus;
  protectedApps?: ProtectedAppRule[];
  paused?: boolean;
  maxSegmentsPerRead?: number;
  canUseForAI?: boolean;
  canExportToAgent?: boolean;
}

export class AudioObservationAdapter implements SourceAdapter {
  readonly id: string;
  readonly kind = "audio" as const;
  readonly displayName: string;
  readonly capabilities = ["incremental_read"] as const;
  readonly defaultSensitivity: Sensitivity;
  readonly permissionScope: PermissionScope;

  constructor(private readonly options: AudioObservationAdapterOptions) {
    this.id = options.id ?? AUDIO_OBSERVATION_ADAPTER_ID;
    this.displayName = options.displayName ?? "Audio Observation";
    this.defaultSensitivity = options.defaultSensitivity ?? "confidential";
    this.permissionScope = perceptionPermissionScope(this.kind, {
      canUseForAI: options.canUseForAI ?? false,
      canExportToAgent: options.canExportToAgent ?? false
    });
  }

  async readCursor(cursor?: string): Promise<AdapterReadResult> {
    if (this.options.paused) {
      return { events: [], nextCursor: cursor ?? "0", warnings: ["Audio observation is paused."] };
    }
    const permission =
      this.options.permission ??
      audioPermission(
        this.options.scope.kind === "system_audio" ? "system_audio" : "microphone",
        "not_determined"
      );
    if (permission.status !== "granted" && permission.status !== "not_required") {
      return {
        events: [],
        nextCursor: cursor ?? "0",
        warnings: [`Audio observation needs ${permission.kind} permission: ${permission.status}`]
      };
    }

    const sorted = sortSegments(this.options.segments);
    const start = cursor ? Number.parseInt(cursor, 10) : 0;
    const safeStart = Number.isFinite(start) && start > 0 ? start : 0;
    const selected = sorted.slice(safeStart, safeStart + (this.options.maxSegmentsPerRead ?? 10));
    const warnings: string[] = [];
    const inputs: ObservationInput[] = [];

    for (const segment of selected) {
      if (!audioScopesMatch(segment.scope, this.options.scope)) {
        warnings.push(
          `Skipped audio segment ${segment.id}; outside selected ${this.options.scope.kind} scope.`
        );
        continue;
      }
      const input = segmentToAudioObservationInput(segment);
      if (isProtectedObservation(input, this.options.protectedApps)) {
        warnings.push(`Suppressed protected audio segment ${segment.id}.`);
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

export function segmentToAudioObservationInput(segment: AudioSegment): ObservationInput {
  return {
    type: "audio_segment",
    tier: "tier3",
    sourceKind: "audio",
    occurredAt: segment.startedAt,
    observedAt: segment.endedAt,
    ...(segment.redactionState ? { redactionState: segment.redactionState } : {}),
    runtimeSessionId: segment.runtimeSessionId,
    sequence: segment.sequence,
    ...(segment.app ? { app: { ...segment.app } } : {}),
    audio: {
      scopeKind: segment.scope.kind,
      scopeLabel: segment.scope.label,
      segmentId: segment.id,
      segmentHash: segment.segmentHash,
      durationMs: segment.durationMs,
      ...(segment.redactedSummary ? { redactedSummary: segment.redactedSummary } : {})
    }
  };
}

function sortSegments(segments: AudioSegment[]): AudioSegment[] {
  return [...segments].sort((a, b) => {
    const byTime = a.startedAt.localeCompare(b.startedAt);
    return byTime === 0 ? a.sequence - b.sequence : byTime;
  });
}
