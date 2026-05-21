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
import {
  frameToScreenObservationInput,
  scopeAllowsFrame
} from "../screen/screenObservationAdapter";
import type { ScreenCaptureFrame, ScreenCaptureScope } from "../screen/screenCaptureTypes";
import { screenPermission } from "../screen/screenCaptureTypes";

export const OCR_OBSERVATION_ADAPTER_ID = "perception_ocr";

export interface OcrRecognitionResult {
  text: string;
  textHash: string;
  confidence?: number;
}

export interface LocalOcrEngine {
  readonly id: string;
  readonly languages: string[];
  recognize(frame: ScreenCaptureFrame): Promise<OcrRecognitionResult | undefined>;
}

export interface OcrObservationAdapterOptions {
  frames: ScreenCaptureFrame[];
  scope: ScreenCaptureScope;
  engine: LocalOcrEngine;
  id?: string;
  displayName?: string;
  defaultSensitivity?: Sensitivity;
  permission?: ObservationPermissionStatus;
  protectedApps?: ProtectedAppRule[];
  maxFramesPerRead?: number;
  canUseForAI?: boolean;
  canExportToAgent?: boolean;
}

export class OcrObservationAdapter implements SourceAdapter {
  readonly id: string;
  readonly kind = "ocr" as const;
  readonly displayName: string;
  readonly capabilities = ["incremental_read"] as const;
  readonly defaultSensitivity: Sensitivity;
  readonly permissionScope: PermissionScope;

  constructor(private readonly options: OcrObservationAdapterOptions) {
    this.id = options.id ?? OCR_OBSERVATION_ADAPTER_ID;
    this.displayName = options.displayName ?? "OCR Observation";
    this.defaultSensitivity = options.defaultSensitivity ?? "confidential";
    this.permissionScope = perceptionPermissionScope(this.kind, {
      canUseForAI: options.canUseForAI ?? false,
      canExportToAgent: options.canExportToAgent ?? false
    });
  }

  async readCursor(cursor?: string): Promise<AdapterReadResult> {
    const permission = this.options.permission ?? screenPermission("not_determined");
    if (permission.status !== "granted" && permission.status !== "not_required") {
      return {
        events: [],
        nextCursor: cursor ?? "0",
        warnings: [
          `OCR needs Screen Recording permission before frame processing: ${permission.status}`
        ]
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
          `Skipped OCR for frame ${frame.id}; outside selected ${this.options.scope.kind} scope.`
        );
        continue;
      }
      const screenInput = frameToScreenObservationInput(frame);
      if (isProtectedObservation(screenInput, this.options.protectedApps)) {
        warnings.push(`Suppressed OCR for protected screen frame ${frame.id}.`);
        continue;
      }
      const result = await this.options.engine.recognize(frame);
      if (!result?.text) {
        warnings.push(`OCR produced no text for frame ${frame.id}.`);
        continue;
      }
      inputs.push(frameToOcrObservationInput(frame, result, this.options.engine));
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

export function frameToOcrObservationInput(
  frame: ScreenCaptureFrame,
  result: OcrRecognitionResult,
  engine: LocalOcrEngine
): ObservationInput {
  return {
    type: "ocr_text",
    tier: "tier3",
    sourceKind: "ocr",
    occurredAt: frame.capturedAt,
    observedAt: frame.capturedAt,
    runtimeSessionId: frame.runtimeSessionId,
    sequence: frame.sequence,
    ...(frame.app ? { app: { ...frame.app } } : {}),
    ...(frame.window ? { window: { ...frame.window } } : {}),
    ocr: {
      text: result.text,
      textHash: result.textHash,
      sourceFrameHash: frame.frameHash,
      languages: engine.languages,
      engine: engine.id,
      ...(result.confidence ? { confidence: result.confidence } : {})
    }
  };
}

function sortFrames(frames: ScreenCaptureFrame[]): ScreenCaptureFrame[] {
  return [...frames].sort((a, b) => {
    const byTime = a.capturedAt.localeCompare(b.capturedAt);
    return byTime === 0 ? a.sequence - b.sequence : byTime;
  });
}
