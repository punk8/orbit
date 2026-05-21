import { systemPreferences } from "electron";
import type { ObservationPermissionStatus } from "@orbit/core";

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
