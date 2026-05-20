import type { AdapterReadResult, PermissionScope, Sensitivity, SourceAdapter } from "@orbit/core";
import { defaultPermissionScopeForSource } from "@orbit/core";
import { FixtureAdapter, readFixtureItems } from "../fixture/fixtureAdapter";
import { normalizeApprovedSeaTalkRecord } from "./seatalkNormalizer";

export interface SeaTalkAdapterOptions {
  approvedImportDirectory: string;
  id?: string;
  displayName?: string;
  defaultSensitivity?: Sensitivity;
}

export class SeaTalkAdapter implements SourceAdapter {
  readonly id: string;
  readonly kind = "seatalk" as const;
  readonly displayName: string;
  readonly capabilities = ["incremental_read", "thread_metadata"] as const;
  readonly defaultSensitivity: Sensitivity;
  readonly permissionScope: PermissionScope;

  constructor(private readonly options: SeaTalkAdapterOptions) {
    this.id = options.id ?? "seatalk_approved_import";
    this.displayName = options.displayName ?? "SeaTalk Approved Import";
    this.defaultSensitivity = options.defaultSensitivity ?? "confidential";
    this.permissionScope = defaultPermissionScopeForSource(this.kind, this.defaultSensitivity);
  }

  async readCursor(cursor?: string): Promise<AdapterReadResult> {
    const normalizedRecords = readFixtureItems(this.options.approvedImportDirectory).map(
      (item) => ({
        ...item,
        record: normalizeApprovedSeaTalkRecord(item.record)
      })
    );
    const adapter = new FixtureAdapter({
      kind: "seatalk",
      directory: this.options.approvedImportDirectory,
      id: this.id,
      displayName: this.displayName,
      defaultSensitivity: this.defaultSensitivity
    });
    const result = await adapter.readCursor(cursor);

    const output: AdapterReadResult = {
      events: result.events
    };
    if (result.nextCursor) {
      output.nextCursor = result.nextCursor;
    }
    const warnings =
      normalizedRecords.length === 0
        ? ["SeaTalk adapter is limited to explicit approved imports; no records were found."]
        : result.warnings;
    if (warnings && warnings.length > 0) {
      output.warnings = warnings;
    }
    return output;
  }
}
