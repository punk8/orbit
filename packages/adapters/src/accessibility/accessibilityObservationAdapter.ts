import type { ObservationInput, ObservationPermissionStatus, ProtectedAppRule } from "@orbit/core";
import { StaticObservationInputAdapter } from "../observation/staticObservationInputAdapter";

export interface AccessibilityObservationAdapterOptions {
  inputs: ObservationInput[];
  permission: ObservationPermissionStatus;
  id?: string;
  protectedApps?: ProtectedAppRule[];
}

export class AccessibilityObservationAdapter extends StaticObservationInputAdapter {
  constructor(options: AccessibilityObservationAdapterOptions) {
    super({
      id: options.id ?? "accessibility_observation",
      kind: "accessibility",
      displayName: "Accessibility Observation",
      inputs: options.inputs,
      protectedApps: options.protectedApps,
      disabledWarning:
        options.permission.status === "granted"
          ? undefined
          : `Accessibility observation needs permission: ${options.permission.status}.`,
      filterInput(input) {
        if (input.type !== "accessibility_snapshot") {
          return {
            keep: false,
            warning: `Ignored non-accessibility observation input: ${input.type}.`
          };
        }
        if (input.accessibility?.containsSecureField) {
          const accessibility = { ...input.accessibility };
          delete accessibility.text;
          const safeInput = { ...input };
          delete safeInput.raw;
          return {
            keep: true,
            input: {
              ...safeInput,
              accessibility
            },
            warning: "Accessibility snapshot contained a secure field; raw text was dropped."
          };
        }
        return { keep: true, input };
      }
    });
  }
}
