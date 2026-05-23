import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalAgentAdapter } from "./localAgent/localAgentAdapter";

describe("LocalAgentAdapter", () => {
  it("reads sanitized local agent sessions from an explicit path", async () => {
    const directory = mkdtempSync(join(tmpdir(), "orbit-local-agent-"));
    const nested = join(directory, "nested");
    mkdirSync(nested);
    writeJsonl(join(directory, "claude-code-session.jsonl"), [
      {
        timestamp: "2026-05-22T01:00:00.000Z",
        type: "message",
        role: "user",
        text: "Inspect Orbit",
        project: "orbit"
      },
      {
        timestamp: "2026-05-22T01:01:00.000Z",
        type: "command",
        command: "pnpm test",
        project: "orbit"
      },
      {
        timestamp: "2026-05-22T01:02:00.000Z",
        type: "code_change",
        title: "Update adapter",
        project: "orbit"
      },
      {
        timestamp: "2026-05-22T01:03:00.000Z",
        type: "test_result",
        summary: "Tests passed",
        project: "orbit"
      }
    ]);
    writeFileSync(
      join(directory, "malformed.jsonl"),
      [
        JSON.stringify({
          timestamp: "2026-05-22T01:04:00.000Z",
          type: "message",
          text: "Valid before malformed",
          project: "orbit"
        }),
        "{bad json",
        JSON.stringify({
          timestamp: "2026-05-22T01:05:00.000Z",
          type: "command",
          command: "pnpm typecheck",
          project: "orbit"
        })
      ].join("\n")
    );
    writeFileSync(
      join(nested, "agent-child-session.json"),
      JSON.stringify([
        {
          timestamp: "2026-05-22T01:06:00.000Z",
          type: "code_change",
          title: "Child update",
          project: "orbit"
        },
        {
          timestamp: "2026-05-22T01:07:00.000Z",
          type: "test_result",
          summary: "Child tests passed",
          project: "orbit"
        }
      ])
    );
    const adapter = new LocalAgentAdapter({
      path: directory,
      id: "local_agent_test",
      defaultApp: "Claude Code"
    });

    try {
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
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function writeJsonl(path: string, records: Array<Record<string, unknown>>): void {
  writeFileSync(path, records.map((record) => JSON.stringify(record)).join("\n"));
}
