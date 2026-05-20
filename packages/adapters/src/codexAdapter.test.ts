import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CodexAdapter } from "./codex/codexAdapter";

describe("CodexAdapter", () => {
  it("reads sanitized session files from an explicit path", async () => {
    const adapter = new CodexAdapter({
      path: join(process.cwd(), "fixtures/codex-sessions"),
      id: "codex_test"
    });

    const result = await adapter.readCursor();
    expect(result.events).toHaveLength(3);
    expect(result.nextCursor).toBe("3");
    expect(result.events[0]?.source.kind).toBe("codex");
    expect(result.events[0]?.source.pointer).toContain("codex://");
    expect(result.events[0]?.context.project).toBe("orbit");
    expect(result.events[1]?.type).toBe("command");

    const second = await adapter.readCursor(result.nextCursor);
    expect(second.events).toHaveLength(0);
  });
});
