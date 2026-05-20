import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { FixtureAdapter } from "./fixture/fixtureAdapter";

describe("FixtureAdapter", () => {
  it("reads fixture events incrementally", async () => {
    const adapter = new FixtureAdapter({
      kind: "codex",
      directory: fileURLToPath(new URL("../../../fixtures/codex", import.meta.url))
    });

    const first = await adapter.readCursor();
    expect(first.events.length).toBeGreaterThan(0);
    expect(first.events[0]?.source.kind).toBe("codex");

    const second = await adapter.readCursor(first.nextCursor);
    expect(second.events).toHaveLength(0);
  });
});
