import type { Event } from "../types/event";
import type { Sensitivity } from "../types/common";
import { createStableId } from "../id";
import { hashObject } from "../hash";
import { perceptionRawRetentionPolicyId } from "../perception/perceptionCapabilities";
import { DESKTOP_OBSERVATION_ADAPTER_ID, isProtectedObservation } from "./observationPolicy";
import type { ObservationInput, ObservationInputType, ProtectedAppRule } from "./observationTypes";
import { observationSourceKindToCoreSourceKind } from "./observationTypes";

export interface NormalizeObservationOptions {
  adapterId?: string;
  protectedApps?: ProtectedAppRule[];
}

export function normalizeObservationInput(
  input: ObservationInput,
  options: NormalizeObservationOptions = {}
): Event {
  const adapterId = options.adapterId ?? DESKTOP_OBSERVATION_ADAPTER_ID;
  const protectedApp = isProtectedObservation(input, options.protectedApps);
  const eventType = normalizeObservationEventType(input.type, protectedApp);
  const pointer = observationSourcePointer(input, eventType);
  const appName = input.app?.name ?? "Unknown app";
  const context = buildContext(input, eventType, protectedApp);
  const content = buildContent(input, eventType, appName, protectedApp);
  const sensitivity = inferSensitivity(input, eventType, protectedApp);
  const redactionState =
    protectedApp || input.accessibility?.containsSecureField
      ? "redacted"
      : (input.redactionState ?? "none");
  const hashInput = {
    sourcePointer: pointer,
    type: eventType,
    occurredAt: input.occurredAt,
    content,
    context
  };

  return {
    id:
      input.id ??
      createStableId("event", {
        adapterId,
        pointer,
        type: eventType,
        occurredAt: input.occurredAt,
        dedupKey: observationDedupKey(input, eventType, protectedApp)
      }),
    schemaVersion: 1,
    source: {
      kind: observationSourceKindToCoreSourceKind(
        protectedApp && input.sourceKind !== "desktop" ? "desktop" : input.sourceKind
      ),
      adapterId,
      pointer
    },
    occurredAt: input.occurredAt,
    observedAt: input.observedAt ?? input.occurredAt,
    context,
    type: eventType,
    content,
    classification: {
      topics: classificationTopics(eventType),
      entities: [appName].filter((value) => value !== "Unknown app"),
      intent: "observation",
      confidence: protectedApp ? 0.9 : 0.8
    },
    privacy: {
      sensitivity,
      retentionPolicyId: "observation_default",
      redactionState
    },
    hash: hashObject(hashInput)
  };
}

export function normalizeObservationInputs(
  inputs: ObservationInput[],
  options: NormalizeObservationOptions = {}
): Event[] {
  return sortObservationInputs(inputs).map((input) => normalizeObservationInput(input, options));
}

export function sortObservationInputs(inputs: ObservationInput[]): ObservationInput[] {
  return [...inputs].sort((a, b) => {
    const byTime = a.occurredAt.localeCompare(b.occurredAt);
    return byTime === 0 ? a.sequence - b.sequence : byTime;
  });
}

export function observationSourcePointer(
  input: ObservationInput,
  type: ObservationInputType = input.type
): string {
  switch (type) {
    case "app_focus":
      return `desktop://app-focus/${input.runtimeSessionId}#${input.sequence}`;
    case "window_focus":
    case "window_title_change":
      return `desktop://window/${input.runtimeSessionId}#${input.sequence}`;
    case "accessibility_snapshot":
      return `accessibility://snapshot/${input.runtimeSessionId}#${input.sequence}`;
    case "browser_navigation": {
      const profile = encodePointerPart(
        input.browser?.profileId ?? input.app?.bundleId ?? "browser"
      );
      return `browser://navigation/${profile}/${encodePointerPart(input.occurredAt)}`;
    }
    case "terminal_command":
    case "terminal_output_summary": {
      const sessionId = encodePointerPart(input.terminal?.sessionId ?? input.runtimeSessionId);
      const index = input.terminal?.commandIndex ?? input.sequence;
      return `terminal://session/${sessionId}#${index}`;
    }
    case "clipboard_change":
      return `clipboard://change/${input.runtimeSessionId}#${input.sequence}`;
    case "file_activity": {
      const rootId = encodePointerPart(input.file?.rootId ?? "unknown-root");
      const path = encodePointerPath(input.file?.relativePath ?? "unknown-path");
      const eventId = encodePointerPart(input.id ?? String(input.sequence));
      return `filesystem://watch/${rootId}/${path}#${eventId}`;
    }
    case "screen_observation":
      return `screen://capture/${input.runtimeSessionId}/${encodePointerPart(
        input.screen?.scopeKind ?? "unknown-scope"
      )}/${encodePointerPart(input.screen?.frameHash ?? String(input.sequence))}#${input.sequence}`;
    case "ocr_text":
      return `ocr://capture/${input.runtimeSessionId}/${encodePointerPart(
        input.ocr?.sourceFrameHash ?? input.ocr?.textHash ?? String(input.sequence)
      )}#${input.sequence}`;
    case "audio_segment":
      return `audio://capture/${input.runtimeSessionId}/${encodePointerPart(
        input.audio?.segmentHash ?? input.audio?.segmentId ?? String(input.sequence)
      )}#${input.sequence}`;
    case "transcript_segment":
      return `transcript://meeting/${input.runtimeSessionId}/${encodePointerPart(
        input.transcript?.sourceSegmentHash ?? input.transcript?.textHash ?? String(input.sequence)
      )}#${input.sequence}`;
    case "permission_state":
      return `desktop://permission/${input.runtimeSessionId}#${input.sequence}`;
    case "observation_state":
      return `desktop://state/${input.runtimeSessionId}#${input.sequence}`;
  }
}

export function observationDedupKey(
  input: ObservationInput,
  type: ObservationInputType = input.type,
  protectedApp = isProtectedObservation(input)
): string {
  const appKey = input.app?.bundleId ?? input.app?.name ?? "unknown-app";
  switch (type) {
    case "app_focus":
      return `app_focus:${appKey}`;
    case "window_focus":
    case "window_title_change":
      return protectedApp
        ? `protected_window:${appKey}`
        : `window_focus:${appKey}:${input.window?.titleHash ?? input.window?.title ?? ""}`;
    case "accessibility_snapshot":
      return `accessibility_snapshot:${appKey}:${input.accessibility?.textHash ?? ""}`;
    case "browser_navigation":
      return `browser_navigation:${appKey}:${normalizeUrl(input.browser?.url) ?? ""}:${
        input.browser?.title ?? ""
      }`;
    case "terminal_command":
    case "terminal_output_summary":
      return `terminal_command:${input.terminal?.sessionId ?? input.runtimeSessionId}:${
        input.terminal?.commandIndex ?? input.sequence
      }`;
    case "clipboard_change":
      return `clipboard_change:${input.clipboard?.contentHash ?? input.sequence}`;
    case "file_activity":
      return `file_activity:${input.file?.rootId ?? ""}:${input.file?.relativePath ?? ""}:${
        input.file?.operation ?? ""
      }:${input.file?.contentHash ?? ""}`;
    case "screen_observation":
      return `screen_observation:${input.runtimeSessionId}:${input.screen?.scopeKind ?? ""}:${
        input.screen?.frameHash ?? input.sequence
      }`;
    case "ocr_text":
      return `ocr_text:${input.runtimeSessionId}:${input.ocr?.sourceFrameHash ?? ""}:${
        input.ocr?.textHash ?? input.sequence
      }`;
    case "audio_segment":
      return `audio_segment:${input.runtimeSessionId}:${input.audio?.segmentHash ?? input.sequence}`;
    case "transcript_segment":
      return `transcript_segment:${input.runtimeSessionId}:${
        input.transcript?.sourceSegmentHash ?? ""
      }:${input.transcript?.textHash ?? input.sequence}`;
    default:
      return `${type}:${input.runtimeSessionId}:${input.sequence}`;
  }
}

function normalizeObservationEventType(
  type: ObservationInputType,
  protectedApp: boolean
): ObservationInputType {
  if (
    protectedApp &&
    (type === "window_focus" ||
      type === "window_title_change" ||
      type === "accessibility_snapshot" ||
      type === "clipboard_change" ||
      type === "screen_observation" ||
      type === "ocr_text" ||
      type === "audio_segment" ||
      type === "transcript_segment")
  ) {
    return "app_focus";
  }
  return type;
}

function buildContext(
  input: ObservationInput,
  type: ObservationInputType,
  protectedApp: boolean
): Event["context"] {
  const context: Event["context"] = {};
  if (input.app?.name) context.app = input.app.name;
  if (!protectedApp && input.window?.title) context.windowTitle = truncate(input.window.title, 180);
  const url = !protectedApp ? normalizeUrl(input.browser?.url) : undefined;
  if (url) context.url = url;
  if (input.terminal?.cwd && !protectedApp) context.project = basename(input.terminal.cwd);
  if (input.file?.rootId) context.project = input.file.rootId;
  if (
    type === "screen_observation" ||
    type === "ocr_text" ||
    type === "audio_segment" ||
    type === "transcript_segment" ||
    type === "observation_state" ||
    type === "permission_state"
  ) {
    context.threadId = input.runtimeSessionId;
  }
  return context;
}

function buildContent(
  input: ObservationInput,
  type: ObservationInputType,
  appName: string,
  protectedApp: boolean
): Event["content"] {
  if (protectedApp) {
    return {
      title: `Focused protected app ${appName}`,
      summary: "Protected app was focused; semantic window details were not stored."
    };
  }

  switch (type) {
    case "app_focus":
      return {
        title: `Focused ${appName}`,
        summary: `Frontmost app changed to ${appName}.`
      };
    case "window_focus":
      return {
        title: `Focused window in ${appName}`,
        summary: input.window?.title
          ? `Window focus observed in ${appName}: ${truncate(input.window.title, 180)}`
          : `Window focus observed in ${appName}.`
      };
    case "window_title_change":
      return {
        title: `Window title changed in ${appName}`,
        summary: input.window?.title
          ? `Window title changed in ${appName}: ${truncate(input.window.title, 180)}`
          : `Window title changed in ${appName}.`
      };
    case "accessibility_snapshot":
      return {
        title: `Accessibility snapshot in ${appName}`,
        summary: input.accessibility?.text
          ? truncate(input.accessibility.text, 240)
          : "Accessibility snapshot observed without stored raw text."
      };
    case "browser_navigation":
      return {
        title: input.browser?.title ?? `Browser navigation in ${appName}`,
        summary: "Browser navigation observed."
      };
    case "terminal_command":
      return {
        title: input.terminal?.command
          ? `Terminal command: ${commandName(input.terminal.command)}`
          : "Terminal command observed",
        summary: input.terminal?.command
          ? `Terminal command observed: ${truncate(input.terminal.command, 180)}`
          : "Terminal command observed."
      };
    case "terminal_output_summary":
      return {
        title: "Terminal output summary",
        summary: "Terminal output summary observed without storing raw output."
      };
    case "clipboard_change":
      return {
        title: "Clipboard changed",
        summary: input.clipboard?.redactedSummary
          ? `Clipboard changed (${input.clipboard.contentType}): ${input.clipboard.redactedSummary}`
          : `Clipboard changed (${input.clipboard?.contentType ?? "unknown"}).`
      };
    case "file_activity":
      return {
        title: input.file
          ? `${input.file.operation} ${input.file.relativePath}`
          : "File activity observed",
        summary: input.file
          ? `File ${input.file.operation}: ${input.file.relativePath}`
          : "File activity observed."
      };
    case "screen_observation": {
      const dimensions =
        input.screen?.width && input.screen?.height
          ? ` (${input.screen.width}x${input.screen.height})`
          : "";
      const scope = [input.screen?.scopeKind, input.screen?.scopeLabel].filter(Boolean).join(" ");
      const summary = input.screen?.redactedSummary
        ? ` ${truncate(input.screen.redactedSummary, 220)}`
        : "";
      const attachment =
        input.screen?.rawLocalRef && input.screen.frameHash
          ? {
              id: input.screen.frameHash,
              kind: "image" as const,
              name: "screen-frame",
              localRef: input.screen.rawLocalRef,
              sourcePointer: observationSourcePointer(input, type),
              ...(input.screen.sizeBytes ? { sizeBytes: input.screen.sizeBytes } : {}),
              hash: input.screen.frameHash
            }
          : undefined;
      return {
        title: `Screen observation in ${appName}`,
        summary: `Screen observation captured${scope ? ` for ${scope}` : ""}${dimensions}.${summary}`,
        metadata: {
          scopeKind: input.screen?.scopeKind,
          scopeLabel: input.screen?.scopeLabel,
          frameHash: input.screen?.frameHash,
          width: input.screen?.width,
          height: input.screen?.height,
          rawFrameStored: Boolean(input.screen?.rawLocalRef),
          ...(input.screen?.rawLocalRef
            ? {
                rawFrameState:
                  input.screen.cleanupState === "deleted"
                    ? "deleted"
                    : input.screen.cleanupState === "expired"
                      ? "expired"
                      : input.screen.cleanupState === "source_disabled"
                        ? "source_disabled"
                        : "available",
                rawFrameLocalRef: input.screen.rawLocalRef,
                rawFrameSizeBytes: input.screen.sizeBytes,
                capturedAt: input.occurredAt,
                rawFrameStoredAt: input.screen.rawStoredAt ?? input.occurredAt,
                retentionPolicyId: input.screen.rawRetentionTtlMinutes
                  ? perceptionRawRetentionPolicyId(input.screen.rawRetentionTtlMinutes)
                  : "perception_summary_only",
                rawFrameExpiresAt: input.screen.rawFrameExpiresAt,
                protectionStatus: input.screen.protectionStatus ?? "allowed",
                cleanupState: input.screen.cleanupState ?? "retained"
              }
            : {}),
          ocrStatus: "pending",
          redactionState: input.redactionState ?? "none",
          exportEligibility: "summary_only"
        },
        ...(input.screen?.rawLocalRef && attachment
          ? {
              rawRef: input.screen.rawLocalRef,
              attachments: [attachment]
            }
          : {})
      };
    }
    case "ocr_text":
      return {
        title: `OCR text in ${appName}`,
        summary: input.ocr?.text
          ? truncate(input.ocr.text, 260)
          : `OCR text observed with ${input.ocr?.engine ?? "local"} engine.`,
        metadata: {
          provider: input.ocr?.engine ?? "local",
          languages: input.ocr?.languages ?? [],
          textHash: input.ocr?.textHash,
          sourceFrameHash: input.ocr?.sourceFrameHash,
          lineCount: input.ocr?.text ? countLines(input.ocr.text) : 0,
          snippetCount: input.ocr?.text ? 1 : 0,
          confidence: input.ocr?.confidence,
          redactionState: input.redactionState ?? "none",
          rawTextStored: false,
          summaryStored: Boolean(input.ocr?.text),
          exportEligibility: "summary_only"
        }
      };
    case "audio_segment": {
      const seconds = input.audio?.durationMs
        ? `${Math.round(input.audio.durationMs / 1000)}s`
        : "bounded";
      const scope = [input.audio?.scopeKind, input.audio?.scopeLabel].filter(Boolean).join(" ");
      return {
        title: `Audio segment in ${appName}`,
        summary: input.audio?.redactedSummary
          ? `Audio segment captured${scope ? ` for ${scope}` : ""} (${seconds}). ${truncate(
              input.audio.redactedSummary,
              220
            )}`
          : `Audio segment captured${scope ? ` for ${scope}` : ""} (${seconds}) without raw audio storage.`,
        ...(input.audio?.rawLocalRef
          ? {
              rawRef: input.audio.rawLocalRef,
              attachments: [
                {
                  id: input.audio.segmentHash,
                  kind: "audio" as const,
                  name: "audio-segment",
                  localRef: input.audio.rawLocalRef,
                  sourcePointer: observationSourcePointer(input, type),
                  ...(input.audio.sizeBytes ? { sizeBytes: input.audio.sizeBytes } : {}),
                  hash: input.audio.segmentHash
                }
              ]
            }
          : {})
      };
    }
    case "transcript_segment":
      return {
        title: `Transcript segment in ${appName}`,
        summary: input.transcript?.text
          ? truncate(input.transcript.text, 300)
          : `Transcript segment observed with ${input.transcript?.provider ?? "local"} provider.`
      };
    case "permission_state":
      return {
        title: "Observation permission state",
        summary: input.permission
          ? `${input.permission.kind} permission is ${input.permission.status}.`
          : "Observation permission state changed."
      };
    case "observation_state":
      return {
        title: "Observation runtime state",
        summary: "Observation runtime state changed."
      };
    default:
      return {
        title: `${type} observed`,
        summary: `${type} observed without storing raw payload.`
      };
  }
}

function inferSensitivity(
  input: ObservationInput,
  type: ObservationInputType,
  protectedApp: boolean
): Sensitivity {
  if (protectedApp) return "internal";
  if (
    type === "accessibility_snapshot" ||
    type === "terminal_command" ||
    type === "terminal_output_summary" ||
    type === "clipboard_change"
  ) {
    return "confidential";
  }
  if ((type === "window_focus" || type === "window_title_change") && input.window?.title) {
    return "confidential";
  }
  if (
    type === "screen_observation" ||
    type === "ocr_text" ||
    type === "audio_segment" ||
    type === "transcript_segment"
  ) {
    return "confidential";
  }
  return "internal";
}

function classificationTopics(type: ObservationInputType): string[] {
  if (type === "screen_observation" || type === "ocr_text") {
    return ["perception", "screen_ocr"];
  }
  if (type === "audio_segment" || type === "transcript_segment") {
    return ["perception", "audio"];
  }
  return ["background_observation"];
}

function normalizeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function commandName(command: string): string {
  return command.trim().split(/\s+/)[0] ?? "command";
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function countLines(value: string): number {
  return value.split(/\r?\n/).filter((line) => line.trim()).length;
}

function encodePointerPart(value: string): string {
  return encodeURIComponent(value).replaceAll("%3A", ":");
}

function encodePointerPath(value: string): string {
  return value
    .split("/")
    .map((part) => encodePointerPart(part))
    .join("/");
}
