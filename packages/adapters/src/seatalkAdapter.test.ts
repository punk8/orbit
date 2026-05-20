import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SeaTalkAdapter } from "./seatalk/seatalkAdapter";

describe("SeaTalkAdapter", () => {
  it("only reads approved import fixtures", async () => {
    const adapter = new SeaTalkAdapter({
      approvedImportDirectory: join(process.cwd(), "fixtures/seatalk"),
      id: "seatalk_test"
    });

    const result = await adapter.readCursor();
    expect(result.events).toHaveLength(4);
    expect(result.events.every((event) => event.source.kind === "seatalk")).toBe(true);
    expect(result.events.every((event) => event.privacy.sensitivity === "confidential")).toBe(true);
  });
});
