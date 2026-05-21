import type {
  AdapterReadResult,
  Event,
  PermissionScope,
  PerceptionControlPlaneStatus,
  SourceAdapter
} from "@orbit/core";
import { createStableId, hashObject } from "@orbit/core";
import type { VisionProvider, VisionSummaryInput } from "@orbit/ai";
import { perceptionPermissionScope } from "../perception/perceptionAdapterPolicy";

export const VISION_SUMMARY_ADAPTER_ID = "perception_vision";

export interface VisionSummaryPolicy {
  providerEnabled: boolean;
  canUseScreenForAI: boolean;
  canUseVisionForAI: boolean;
  allowExternal: boolean;
  exportEligible: boolean;
  maxInputChars: number;
  maxOutputTokens: number;
  maxImagePixels: number;
}

export interface VisionSummaryAdapterOptions {
  screenEvents: Event[];
  ocrEvents?: Event[];
  provider: VisionProvider;
  policy: VisionSummaryPolicy;
  id?: string;
  maxEventsPerRead?: number;
  language?: string;
}

export class VisionSummaryAdapter implements SourceAdapter {
  readonly id: string;
  readonly kind = "screen" as const;
  readonly displayName = "Vision Summary";
  readonly capabilities = ["incremental_read"] as const;
  readonly defaultSensitivity = "confidential" as const;
  readonly permissionScope: PermissionScope;

  constructor(private readonly options: VisionSummaryAdapterOptions) {
    this.id = options.id ?? VISION_SUMMARY_ADAPTER_ID;
    this.permissionScope = perceptionPermissionScope("screen", {
      canStoreRaw: false,
      canUseForAI: options.policy.canUseScreenForAI && options.policy.canUseVisionForAI,
      canExportToAgent: options.policy.exportEligible,
      retentionPolicyId: "perception_summary_only"
    });
  }

  async readCursor(cursor?: string): Promise<AdapterReadResult> {
    const policyWarning = visionPolicyWarning(this.options.provider, this.options.policy);
    if (policyWarning) {
      return {
        events: [],
        nextCursor: cursor ?? "0",
        warnings: [policyWarning]
      };
    }

    const screenEvents = this.options.screenEvents
      .filter((event) => event.type === "screen_observation" && event.source.kind === "screen")
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const start = cursor ? Number.parseInt(cursor, 10) : 0;
    const safeStart = Number.isFinite(start) && start > 0 ? start : 0;
    const selected = screenEvents.slice(
      safeStart,
      safeStart + (this.options.maxEventsPerRead ?? 10)
    );
    const warnings: string[] = [];
    const events: Event[] = [];
    const ocrByTimestamp = new Map(
      (this.options.ocrEvents ?? [])
        .filter((event) => event.type === "ocr_text")
        .map((event) => [event.occurredAt, event])
    );

    for (const screenEvent of selected) {
      if (screenEvent.privacy.redactionState === "failed") {
        warnings.push(`Skipped vision summary for failed-redaction event ${screenEvent.id}.`);
        continue;
      }
      const input = buildVisionSummaryInput(
        screenEvent,
        ocrByTimestamp.get(screenEvent.occurredAt),
        this.options.policy,
        this.options.language
      );
      const output = await this.options.provider.summarizeVision(input);
      if (output.redactionState === "failed") {
        warnings.push(`Vision provider returned failed redaction for event ${screenEvent.id}.`);
        continue;
      }
      events.push(visionOutputToEvent(screenEvent, output, this.id));
    }

    return {
      events,
      nextCursor: String(Math.min(screenEvents.length, safeStart + selected.length)),
      warnings
    };
  }
}

export function visionPolicyFromPerceptionStatus(
  status: PerceptionControlPlaneStatus
): VisionSummaryPolicy {
  const screen = status.sources.find((source) => source.sourceKind === "screen");
  const vision = status.sources.find((source) => source.sourceKind === "vision");
  const route = status.providerRoutes.find((providerRoute) => providerRoute.task === "vision");
  return {
    providerEnabled: route?.enabled ?? false,
    canUseScreenForAI: screen?.policy.canUseForAI ?? false,
    canUseVisionForAI: vision?.policy.canUseForAI ?? false,
    allowExternal: route?.allowExternal === true,
    exportEligible:
      screen?.policy.canExportToAgent === true && vision?.policy.canExportToAgent === true,
    maxInputChars: 900,
    maxOutputTokens: 500,
    maxImagePixels: 320_000
  };
}

function visionPolicyWarning(
  provider: VisionProvider,
  policy: VisionSummaryPolicy
): string | undefined {
  if (!policy.providerEnabled) return "Vision provider route is disabled.";
  if (!policy.canUseScreenForAI || !policy.canUseVisionForAI) {
    return "Vision AI use is blocked by screen or vision source policy.";
  }
  if (provider.kind === "disabled" || !provider.enabled) return "Vision provider is disabled.";
  if (provider.kind === "openai-compatible" && !policy.allowExternal) {
    return "External vision provider use is blocked by policy.";
  }
  return undefined;
}

function buildVisionSummaryInput(
  screenEvent: Event,
  ocrEvent: Event | undefined,
  policy: VisionSummaryPolicy,
  language: string | undefined
): VisionSummaryInput {
  const frameHash = readFrameHash(screenEvent);
  const textHash = ocrEvent ? readTextHash(ocrEvent) : undefined;
  return {
    ...(language ? { language } : {}),
    source: {
      eventId: screenEvent.id,
      sourcePointer: screenEvent.source.pointer,
      timestamp: screenEvent.occurredAt,
      ...(screenEvent.context.app ? { app: screenEvent.context.app } : {}),
      ...(screenEvent.context.windowTitle ? { windowTitle: screenEvent.context.windowTitle } : {})
    },
    screen: {
      summary: screenEvent.content.summary ?? screenEvent.content.title ?? "Screen observation.",
      ...(frameHash ? { frameHash } : {})
    },
    ...(ocrEvent
      ? {
          ocr: {
            ...(ocrEvent.content.summary ? { text: ocrEvent.content.summary } : {}),
            ...(textHash ? { textHash } : {})
          }
        }
      : {}),
    policy: {
      canUseForAI: policy.canUseScreenForAI && policy.canUseVisionForAI,
      allowExternal: policy.allowExternal,
      exportEligible: policy.exportEligible,
      redactionState: screenEvent.privacy.redactionState
    },
    budget: {
      maxInputChars: policy.maxInputChars,
      maxOutputTokens: policy.maxOutputTokens,
      maxImagePixels: policy.maxImagePixels
    }
  };
}

function visionOutputToEvent(
  screenEvent: Event,
  output: Awaited<ReturnType<VisionProvider["summarizeVision"]>>,
  adapterId: string
): Event {
  const sourcePointer = `vision://summary/${screenEvent.id}`;
  const content = {
    title: output.title,
    summary: output.summary,
    metadata: {
      vision: {
        provider: output.provider,
        promptVersion: output.metadata.promptVersion,
        budget: output.metadata.budget,
        keyInsights: output.keyInsights,
        decisions: output.decisions,
        followUps: output.followUps,
        sourceEventId: screenEvent.id,
        sourcePointer: screenEvent.source.pointer,
        exportEligible: output.exportEligible,
        redactionState: output.redactionState,
        ...(output.metadata.frameHash ? { frameHash: output.metadata.frameHash } : {})
      }
    }
  };
  return {
    id: createStableId("event", {
      adapterId,
      sourcePointer,
      provider: output.provider,
      summary: output.summary
    }),
    schemaVersion: 1,
    source: {
      kind: "screen",
      adapterId,
      externalId: screenEvent.id,
      pointer: sourcePointer
    },
    occurredAt: screenEvent.occurredAt,
    observedAt: new Date().toISOString(),
    context: {
      ...screenEvent.context,
      threadId: screenEvent.context.threadId ?? screenEvent.id
    },
    type: "screen_observation",
    content,
    classification: {
      topics: ["perception", "vision"],
      entities: screenEvent.context.app ? [screenEvent.context.app] : [],
      intent: "vision_summary",
      confidence: output.confidence
    },
    privacy: {
      sensitivity: screenEvent.privacy.sensitivity,
      retentionPolicyId: "perception_summary_only",
      redactionState: output.redactionState
    },
    hash: hashObject({ sourcePointer, content, privacy: screenEvent.privacy })
  };
}

function readFrameHash(event: Event): string | undefined {
  const match = /\/([^/#]+)#\d+$/.exec(event.source.pointer);
  return match?.[1];
}

function readTextHash(event: Event): string | undefined {
  return event.hash;
}
