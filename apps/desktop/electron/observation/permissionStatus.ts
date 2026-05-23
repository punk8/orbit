import { systemPreferences } from "electron";
import type { ObservationPermissionStatus } from "@orbit/core";

export function detectScreenRecordingPermissionStatus(): ObservationPermissionStatus {
  if (process.platform !== "darwin") {
    return {
      kind: "screen",
      requiredFor: ["screen", "ocr"],
      status: "not_required",
      canRequestFromApp: false
    };
  }
  try {
    const status = systemPreferences.getMediaAccessStatus("screen");
    return {
      kind: "screen",
      requiredFor: ["screen", "ocr"],
      status: normalizeMediaAccessStatus(status),
      canRequestFromApp: true,
      instructions: "Grant macOS Screen Recording permission before screen/OCR capture."
    };
  } catch (error) {
    return {
      kind: "screen",
      requiredFor: ["screen", "ocr"],
      status: "unknown",
      canRequestFromApp: false,
      instructions: error instanceof Error ? error.message : String(error)
    };
  }
}

export function detectAccessibilityPermissionStatus(): ObservationPermissionStatus {
  if (process.platform !== "darwin") {
    return {
      kind: "accessibility",
      requiredFor: ["accessibility", "browser"],
      status: "not_required",
      canRequestFromApp: false
    };
  }
  try {
    return {
      kind: "accessibility",
      requiredFor: ["accessibility", "browser"],
      status: systemPreferences.isTrustedAccessibilityClient(false) ? "granted" : "not_determined",
      canRequestFromApp: true,
      instructions: "Enable Accessibility for Orbit in macOS Privacy & Security settings."
    };
  } catch (error) {
    return {
      kind: "accessibility",
      requiredFor: ["accessibility", "browser"],
      status: "unknown",
      canRequestFromApp: false,
      instructions: error instanceof Error ? error.message : String(error)
    };
  }
}

function normalizeMediaAccessStatus(
  status: "not-determined" | "granted" | "denied" | "restricted" | "unknown"
): ObservationPermissionStatus["status"] {
  if (status === "not-determined") return "not_determined";
  return status;
}
