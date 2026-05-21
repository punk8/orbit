import type {
  AdapterReadResult,
  ObservationInput,
  PermissionScope,
  Sensitivity,
  SourceAdapter
} from "@orbit/core";
import {
  DESKTOP_OBSERVATION_ADAPTER_ID,
  makeObservationPermissionScope,
  normalizeObservationInputs,
  sortObservationInputs
} from "@orbit/core";
import type { ProtectedAppRule } from "@orbit/core";

export interface DesktopObservationAdapterOptions {
  inputs: ObservationInput[];
  id?: string;
  displayName?: string;
  defaultSensitivity?: Sensitivity;
  protectedApps?: ProtectedAppRule[];
}

export class DesktopObservationAdapter implements SourceAdapter {
  readonly id: string;
  readonly kind = "desktop" as const;
  readonly displayName: string;
  readonly capabilities = ["incremental_read"] as const;
  readonly defaultSensitivity: Sensitivity;
  readonly permissionScope: PermissionScope;

  constructor(private readonly options: DesktopObservationAdapterOptions) {
    this.id = options.id ?? DESKTOP_OBSERVATION_ADAPTER_ID;
    this.displayName = options.displayName ?? "Desktop Observation";
    this.defaultSensitivity = options.defaultSensitivity ?? "internal";
    this.permissionScope = makeObservationPermissionScope(this.kind);
  }

  async readCursor(cursor?: string): Promise<AdapterReadResult> {
    const sorted = sortObservationInputs(this.options.inputs);
    const start = cursor ? Number.parseInt(cursor, 10) : 0;
    const safeStart = Number.isFinite(start) && start > 0 ? start : 0;
    const selected = sorted.slice(safeStart);
    const events = normalizeObservationInputs(
      selected,
      this.options.protectedApps
        ? { adapterId: this.id, protectedApps: this.options.protectedApps }
        : { adapterId: this.id }
    );

    return {
      events,
      nextCursor: String(sorted.length)
    };
  }
}
