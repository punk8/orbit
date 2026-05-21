import type { Event } from "../types/event";
import type { Sensitivity } from "../types/common";
import { createStableId } from "../id";
import { hashObject } from "../hash";
import {
  DESKTOP_OBSERVATION_ADAPTER_ID,
  isProtectedObservation
} from "./observationPolicy";
import type {
  ObservationInput,
  ObservationInputType,
  ProtectedAppRule
} from "./observationTypes";
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
  const context = buildContext(input, protectedApp);
  const content = buildContent(input, eventType, appName, protectedApp);
  const sensitivity = inferSensitivity(input, eventType, protectedApp);
  const redactionState = protectedApp || input.accessibility?.containsSecureField ? "redacted" : "none";
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
      topics: ["background_observation"],
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
      const profile = encodePointerPart(input.browser?.profileId ?? input.app?.bundleId ?? "browser");
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
      return `screen://capture/${input.runtimeSessionId}#${input.sequence}`;
    case "ocr_text":
      return `ocr://capture/${input.runtimeSessionId}#${input.sequence}`;
    case "audio_segment":
      return `audio://capture/${input.runtimeSessionId}#${input.sequence}`;
    case "transcript_segment":
      return `transcript://meeting/${input.runtimeSessionId}#${input.sequence}`;
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

function buildContext(input: ObservationInput, protectedApp: boolean): Event["context"] {
  const context: Event["context"] = {};
  if (input.app?.name) context.app = input.app.name;
  if (!protectedApp && input.window?.title) context.windowTitle = truncate(input.window.title, 180);
  const url = !protectedApp ? normalizeUrl(input.browser?.url) : undefined;
  if (url) context.url = url;
  if (input.terminal?.cwd && !protectedApp) context.project = basename(input.terminal.cwd);
  if (input.file?.rootId) context.project = input.file.rootId;
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
  if (type === "screen_observation" || type === "ocr_text" || type === "audio_segment") {
    return "confidential";
  }
  return "internal";
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

function encodePointerPart(value: string): string {
  return encodeURIComponent(value).replaceAll("%3A", ":");
}

function encodePointerPath(value: string): string {
  return value
    .split("/")
    .map((part) => encodePointerPart(part))
    .join("/");
}
