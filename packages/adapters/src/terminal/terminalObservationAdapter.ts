import type { ObservationInput, ProtectedAppRule } from "@orbit/core";
import { StaticObservationInputAdapter } from "../observation/staticObservationInputAdapter";

export type TerminalObservationApprovedPath = "shell_integration" | "explicit_log_import";

export interface TerminalObservationAdapterOptions {
  inputs: ObservationInput[];
  approvedPath?: TerminalObservationApprovedPath;
  id?: string;
  protectedApps?: ProtectedAppRule[];
}

export class TerminalObservationAdapter extends StaticObservationInputAdapter {
  constructor(options: TerminalObservationAdapterOptions) {
    super({
      id: options.id ?? "terminal_observation",
      kind: "terminal",
      displayName: "Terminal Observation",
      inputs: options.inputs,
      protectedApps: options.protectedApps,
      disabledWarning: options.approvedPath
        ? undefined
        : "Terminal observation needs shell integration or explicit log import.",
      filterInput(input) {
        if (
          (input.type !== "terminal_command" && input.type !== "terminal_output_summary") ||
          !input.terminal
        ) {
          return {
            keep: false,
            warning: `Ignored non-terminal observation input: ${input.type}.`
          };
        }
        return { keep: true, input };
      }
    });
  }
}
