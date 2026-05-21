import type {
  AdapterReadResult,
  ObservationInput,
  ObservationSourceKind,
  ProtectedAppRule,
  Sensitivity,
  SourceAdapter,
  SourceKind
} from "@orbit/core";
import {
  makeObservationPermissionScope,
  normalizeObservationInputs,
  sortObservationInputs
} from "@orbit/core";

export interface StaticObservationInputAdapterOptions {
  id: string;
  kind: ObservationSourceKind;
  displayName: string;
  inputs: ObservationInput[];
  defaultSensitivity?: Sensitivity;
  protectedApps?: ProtectedAppRule[] | undefined;
  disabledWarning?: string | undefined;
  filterInput?(input: ObservationInput): ObservationInputFilterResult;
}

export interface ObservationInputFilterResult {
  keep: boolean;
  input?: ObservationInput | undefined;
  warning?: string | undefined;
}

export class StaticObservationInputAdapter implements SourceAdapter {
  readonly id: string;
  readonly kind: SourceKind;
  readonly displayName: string;
  readonly capabilities = ["incremental_read"] as const;
  readonly defaultSensitivity: Sensitivity;
  readonly permissionScope;

  constructor(private readonly options: StaticObservationInputAdapterOptions) {
    this.id = options.id;
    this.kind = options.kind;
    this.displayName = options.displayName;
    this.defaultSensitivity = options.defaultSensitivity ?? "confidential";
    this.permissionScope = makeObservationPermissionScope(options.kind);
  }

  async readCursor(cursor?: string): Promise<AdapterReadResult> {
    if (this.options.disabledWarning) {
      return {
        events: [],
        nextCursor: cursor ?? "0",
        warnings: [this.options.disabledWarning]
      };
    }

    const sorted = sortObservationInputs(this.options.inputs);
    const start = cursor ? Number.parseInt(cursor, 10) : 0;
    const safeStart = Number.isFinite(start) && start > 0 ? start : 0;
    const selected = sorted.slice(safeStart);
    const warnings: string[] = [];
    const accepted: ObservationInput[] = [];

    for (const input of selected) {
      const result = this.options.filterInput?.(input) ?? { keep: true, input };
      if (result.warning) warnings.push(result.warning);
      if (result.keep) accepted.push(result.input ?? input);
    }

    return {
      events: normalizeObservationInputs(
        accepted,
        this.options.protectedApps
          ? { adapterId: this.id, protectedApps: this.options.protectedApps }
          : { adapterId: this.id }
      ),
      nextCursor: String(sorted.length),
      warnings
    };
  }
}
