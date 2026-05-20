import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LocalAgentAdapter } from "./localAgent/localAgentAdapter";

describe("LocalAgentAdapter", () => {
  it("reads sanitized local agent sessions from an explicit path", async () => {
    const adapter = new LocalAgentAdapter({
      path: fileURLToPath(new URL("../../../fixtures/realistic/local-agent", import.meta.url)),
      id: "local_agent_test",
      defaultApp: "Claude Code"
    });

    const result = await adapter.readCursor();
    expect(result.events).toHaveLength(4);
    expect(result.nextCursor).toBe("4");
    expect(result.events[0]?.source.kind).toBe("local_agent");
    expect(result.events[0]?.source.pointer).toContain("local-agent://");
    expect(result.events[0]?.context.app).toBe("Claude Code");
    expect(result.events[1]?.type).toBe("command");

    const second = await adapter.readCursor(result.nextCursor);
    expect(second.events).toHaveLength(0);
  });
});
