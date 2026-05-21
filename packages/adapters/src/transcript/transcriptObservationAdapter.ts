import type { TranscriptionProvider } from "@orbit/ai";
import type {
  AdapterReadResult,
  ObservationInput,
  ObservationPermissionStatus,
  PermissionScope,
  PerceptionControlPlaneStatus,
  ProtectedAppRule,
  Sensitivity,
  SourceAdapter
} from "@orbit/core";
import { hashText, isProtectedObservation, normalizeObservationInputs } from "@orbit/core";
import { perceptionPermissionScope } from "../perception/perceptionAdapterPolicy";
import type { AudioCaptureScope, AudioSegment } from "../audio/audioCaptureTypes";
import { audioPermission } from "../audio/audioCaptureTypes";
import { segmentToAudioObservationInput } from "../audio/audioObservationAdapter";
import { audioScopesMatch } from "../audio/mockAudioCaptureNativeHelper";

export const TRANSCRIPT_OBSERVATION_ADAPTER_ID = "perception_transcript";

export interface TranscriptPolicy {
  providerEnabled: boolean;
  canUseAudioForAI: boolean;
  canUseTranscriptForAI: boolean;
  allowExternal: boolean;
}

export function transcriptPolicyFromPerceptionStatus(
  status: PerceptionControlPlaneStatus
): TranscriptPolicy {
  const audio = status.sources.find((source) => source.sourceKind === "microphone_audio");
  const transcript = status.sources.find((source) => source.sourceKind === "transcript");
  const route = status.providerRoutes.find(
    (providerRoute) => providerRoute.task === "transcription"
  );
  return {
    providerEnabled: route?.enabled ?? false,
    canUseAudioForAI: audio?.policy.canUseForAI ?? false,
    canUseTranscriptForAI: transcript?.policy.canUseForAI ?? false,
    allowExternal: route?.allowExternal === true
  };
}

export interface TranscriptObservationAdapterOptions {
  segments: AudioSegment[];
  scope: AudioCaptureScope;
  provider: TranscriptionProvider;
  policy: TranscriptPolicy;
  id?: string;
  displayName?: string;
  defaultSensitivity?: Sensitivity;
  permission?: ObservationPermissionStatus;
  protectedApps?: ProtectedAppRule[];
  paused?: boolean;
  maxSegmentsPerRead?: number;
}

export class TranscriptObservationAdapter implements SourceAdapter {
  readonly id: string;
  readonly kind = "transcript" as const;
  readonly displayName: string;
  readonly capabilities = ["incremental_read"] as const;
  readonly defaultSensitivity: Sensitivity;
  readonly permissionScope: PermissionScope;

  constructor(private readonly options: TranscriptObservationAdapterOptions) {
    this.id = options.id ?? TRANSCRIPT_OBSERVATION_ADAPTER_ID;
    this.displayName = options.displayName ?? "Transcript Observation";
    this.defaultSensitivity = options.defaultSensitivity ?? "confidential";
    this.permissionScope = perceptionPermissionScope(this.kind);
  }

  async readCursor(cursor?: string): Promise<AdapterReadResult> {
    if (this.options.paused) {
      return {
        events: [],
        nextCursor: cursor ?? "0",
        warnings: ["Transcript observation is paused."]
      };
    }
    const policyWarning = transcriptPolicyWarning(this.options.provider, this.options.policy);
    if (policyWarning) {
      return { events: [], nextCursor: cursor ?? "0", warnings: [policyWarning] };
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
        warnings: [
          `Transcript observation needs ${permission.kind} permission: ${permission.status}`
        ]
      };
    }

    const sorted = [...this.options.segments].sort((a, b) => {
      const byTime = a.startedAt.localeCompare(b.startedAt);
      return byTime === 0 ? a.sequence - b.sequence : byTime;
    });
    const start = cursor ? Number.parseInt(cursor, 10) : 0;
    const safeStart = Number.isFinite(start) && start > 0 ? start : 0;
    const selected = sorted.slice(safeStart, safeStart + (this.options.maxSegmentsPerRead ?? 10));
    const warnings: string[] = [];
    const inputs: ObservationInput[] = [];

    for (const segment of selected) {
      if (!audioScopesMatch(segment.scope, this.options.scope)) {
        warnings.push(
          `Skipped transcript for segment ${segment.id}; outside selected ${this.options.scope.kind} scope.`
        );
        continue;
      }
      const audioInput = segmentToAudioObservationInput(segment);
      if (isProtectedObservation(audioInput, this.options.protectedApps)) {
        warnings.push(`Suppressed transcript for protected audio segment ${segment.id}.`);
        continue;
      }
      if (segment.redactionState === "failed") {
        warnings.push(`Skipped transcript for failed-redaction segment ${segment.id}.`);
        continue;
      }
      const output = await this.options.provider.transcribe({
        segmentId: segment.id,
        segmentHash: segment.segmentHash,
        startedAt: segment.startedAt,
        durationMs: segment.durationMs,
        ...(segment.app?.name ? { app: segment.app.name } : {}),
        scopeLabel: segment.scope.label,
        ...(segment.redactedSummary ? { redactedAudioSummary: segment.redactedSummary } : {}),
        ...(segment.transcriptText ? { fixtureTranscript: segment.transcriptText } : {}),
        policy: {
          canUseForAI:
            this.options.policy.canUseAudioForAI && this.options.policy.canUseTranscriptForAI,
          allowExternal: this.options.policy.allowExternal,
          redactionState: segment.redactionState ?? "none"
        }
      });
      if (output.redactionState === "failed") {
        warnings.push(`Transcription redaction failed for segment ${segment.id}.`);
        continue;
      }
      inputs.push(segmentToTranscriptObservationInput(segment, output));
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

export function segmentToTranscriptObservationInput(
  segment: AudioSegment,
  output: Awaited<ReturnType<TranscriptionProvider["transcribe"]>>
): ObservationInput {
  return {
    type: "transcript_segment",
    tier: "tier3",
    sourceKind: "transcript",
    occurredAt: segment.startedAt,
    observedAt: segment.endedAt,
    runtimeSessionId: segment.runtimeSessionId,
    sequence: segment.sequence,
    ...(segment.app ? { app: { ...segment.app } } : {}),
    transcript: {
      text: output.text,
      textHash: hashText(output.text),
      sourceSegmentHash: segment.segmentHash,
      ...(output.language ? { language: output.language } : {}),
      confidence: output.confidence,
      provider: output.provider.id
    }
  };
}

function transcriptPolicyWarning(
  provider: TranscriptionProvider,
  policy: TranscriptPolicy
): string | undefined {
  if (!policy.providerEnabled) return "Transcription provider route is disabled.";
  if (!policy.canUseAudioForAI || !policy.canUseTranscriptForAI) {
    return "Transcription AI use is blocked by audio or transcript source policy.";
  }
  if (provider.kind === "disabled" || !provider.enabled)
    return "Transcription provider is disabled.";
  if (provider.kind === "openai-compatible" && !policy.allowExternal) {
    return "External transcription provider use is blocked by policy.";
  }
  return undefined;
}
