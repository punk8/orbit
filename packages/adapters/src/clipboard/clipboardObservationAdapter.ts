import type { ObservationInput, ProtectedAppRule } from "@orbit/core";
import { StaticObservationInputAdapter } from "../observation/staticObservationInputAdapter";

export interface ClipboardObservationAdapterOptions {
  inputs: ObservationInput[];
  enabled: boolean;
  id?: string;
  protectedApps?: ProtectedAppRule[];
  allowRedactedSummary?: boolean;
}

export class ClipboardObservationAdapter extends StaticObservationInputAdapter {
  constructor(options: ClipboardObservationAdapterOptions) {
    super({
      id: options.id ?? "clipboard_observation",
      kind: "clipboard",
      displayName: "Clipboard Observation",
      inputs: options.inputs,
      protectedApps: options.protectedApps,
      disabledWarning: options.enabled ? undefined : "Clipboard observation is disabled.",
      filterInput(input) {
        if (input.type !== "clipboard_change" || !input.clipboard) {
          return {
            keep: false,
            warning: `Ignored non-clipboard observation input: ${input.type}.`
          };
        }
        return {
          keep: true,
          input: hashOnlyClipboardInput(input, options.allowRedactedSummary ?? false)
        };
      }
    });
  }
}

function hashOnlyClipboardInput(input: ObservationInput, allowRedactedSummary: boolean): ObservationInput {
  const clipboard = allowRedactedSummary
    ? { ...input.clipboard! }
    : {
        contentType: input.clipboard!.contentType,
        contentHash: input.clipboard!.contentHash
      };
  const safeInput = { ...input };
  delete safeInput.raw;
  return {
    ...safeInput,
    clipboard
  };
}
