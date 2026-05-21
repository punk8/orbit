import type { AllowedFolderRule, ObservationInput, ProtectedAppRule } from "@orbit/core";
import { StaticObservationInputAdapter } from "../observation/staticObservationInputAdapter";

export interface FileActivityAdapterOptions {
  inputs: ObservationInput[];
  allowedFolders: AllowedFolderRule[];
  id?: string;
  protectedApps?: ProtectedAppRule[];
}

export class FileActivityAdapter extends StaticObservationInputAdapter {
  constructor(options: FileActivityAdapterOptions) {
    const enabledRoots = new Set(
      options.allowedFolders.filter((folder) => folder.enabled).map((folder) => folder.id)
    );
    super({
      id: options.id ?? "filesystem_observation",
      kind: "filesystem",
      displayName: "Filesystem Activity",
      inputs: options.inputs,
      protectedApps: options.protectedApps,
      disabledWarning:
        enabledRoots.size > 0
          ? undefined
          : "Filesystem observation needs at least one explicit allowed folder.",
      filterInput(input) {
        if (input.type !== "file_activity" || !input.file) {
          return {
            keep: false,
            warning: `Ignored non-filesystem observation input: ${input.type}.`
          };
        }
        if (!enabledRoots.has(input.file.rootId)) {
          return {
            keep: false,
            warning: `Ignored file activity outside allowed folders: ${input.file.rootId}.`
          };
        }
        return { keep: true, input };
      }
    });
  }
}
