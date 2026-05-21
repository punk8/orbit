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
    expect(result.events).toHaveLength(8);
    expect(result.nextCursor).toBe("8");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings?.[0]).toContain("Skipped invalid JSONL record");
    expect(result.events[0]?.source.kind).toBe("local_agent");
    expect(result.events[0]?.source.pointer).toContain("local-agent://");
    expect(result.events[0]?.context.app).toBe("Claude Code");
    expect(result.events[1]?.type).toBe("command");
    expect(result.events.map((event) => event.source.pointer)).toEqual([
      "local-agent://claude-code-session.jsonl#1",
      "local-agent://claude-code-session.jsonl#2",
      "local-agent://claude-code-session.jsonl#3",
      "local-agent://claude-code-session.jsonl#4",
      "local-agent://malformed.jsonl#1",
      "local-agent://malformed.jsonl#3",
      "local-agent://nested/agent-child-session.json#1",
      "local-agent://nested/agent-child-session.json#2"
    ]);
    expect(result.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["test_result", "code_change", "command"])
    );

    const second = await adapter.readCursor(result.nextCursor);
    expect(second.events).toHaveLength(0);
  });
});
