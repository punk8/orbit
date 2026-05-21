import type { ObservationInput, ProtectedAppRule } from "@orbit/core";
import { StaticObservationInputAdapter } from "../observation/staticObservationInputAdapter";

export type BrowserMetadataApprovedPath = "accessibility" | "extension" | "explicit_import";

export interface BrowserMetadataAdapterOptions {
  inputs: ObservationInput[];
  approvedPath?: BrowserMetadataApprovedPath;
  id?: string;
  protectedApps?: ProtectedAppRule[];
}

export class BrowserMetadataAdapter extends StaticObservationInputAdapter {
  constructor(options: BrowserMetadataAdapterOptions) {
    super({
      id: options.id ?? "browser_metadata_observation",
      kind: "browser",
      displayName: "Browser Metadata",
      inputs: options.inputs,
      protectedApps: options.protectedApps,
      disabledWarning: options.approvedPath
        ? undefined
        : "Browser metadata observation needs an approved path.",
      filterInput(input) {
        if (input.type !== "browser_navigation" || !input.browser) {
          return {
            keep: false,
            warning: `Ignored non-browser observation input: ${input.type}.`
          };
        }
        return { keep: true, input };
      }
    });
  }
}
