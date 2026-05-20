import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SeaTalkAdapter } from "./seatalk/seatalkAdapter";

describe("SeaTalkAdapter", () => {
  it("only reads approved import fixtures", async () => {
    const adapter = new SeaTalkAdapter({
      approvedImportDirectory: fileURLToPath(new URL("../../../fixtures/seatalk", import.meta.url)),
      id: "seatalk_test"
    });

    const result = await adapter.readCursor();
    expect(result.events).toHaveLength(4);
    expect(result.events.every((event) => event.source.kind === "seatalk")).toBe(true);
    expect(result.events.every((event) => event.privacy.sensitivity === "confidential")).toBe(true);
  });
});
