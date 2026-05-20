import type { FixtureRecord } from "../fixture/fixtureTypes";

export function normalizeApprovedSeaTalkRecord(record: FixtureRecord): FixtureRecord {
  if (record.sourceKind !== "seatalk") {
    throw new Error(
      `Approved SeaTalk imports must use sourceKind=seatalk, got ${record.sourceKind}`
    );
  }

  return {
    ...record,
    sensitivity: record.sensitivity ?? "confidential",
    context: {
      app: "SeaTalk",
      ...record.context
    }
  };
}
