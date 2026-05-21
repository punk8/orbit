import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CodexAdapter } from "./codex/codexAdapter";

describe("CodexAdapter", () => {
  it("reads sanitized session files from an explicit path", async () => {
    const adapter = new CodexAdapter({
      path: fileURLToPath(new URL("../../../fixtures/codex-sessions", import.meta.url)),
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

  it("returns warnings for malformed records without aborting ingestion", async () => {
    const adapter = new CodexAdapter({
      path: fileURLToPath(new URL("../../../fixtures/realistic/codex", import.meta.url)),
      id: "codex_realistic_test"
    });

    const result = await adapter.readCursor();
    expect(result.events).toHaveLength(8);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings?.[0]).toContain("Skipped invalid JSONL record");
    expect(result.events.map((event) => event.source.pointer)).toEqual([
      "codex://malformed.jsonl#1",
      "codex://malformed.jsonl#3",
      "codex://nested/orbit-child-session.json#1",
      "codex://nested/orbit-child-session.json#2",
      "codex://orbit-session.jsonl#1",
      "codex://orbit-session.jsonl#2",
      "codex://orbit-session.jsonl#3",
      "codex://orbit-session.jsonl#4"
    ]);
    expect(result.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["test_result", "code_change", "command"])
    );

    const second = await adapter.readCursor(result.nextCursor);
    expect(second.events).toHaveLength(0);
  });

  it("normalizes current Codex Desktop payload logs without ingesting runtime noise", async () => {
    const directory = mkdtempSync(join(tmpdir(), "orbit-codex-real-payload-"));
    try {
      writeFileSync(
        join(directory, "session.jsonl"),
        [
          {
            timestamp: "2026-05-22T02:00:00.000Z",
            type: "session_meta",
            payload: {
              id: "session-real",
              cwd: "/Users/example/Documents/project/orbit",
              originator: "Codex Desktop",
              model_provider: "openai",
              source: "vscode"
            }
          },
          {
            timestamp: "2026-05-22T02:00:01.000Z",
            type: "response_item",
            payload: {
              type: "message",
              role: "developer",
              content: [{ type: "input_text", text: "Hidden runtime instructions" }]
            }
          },
          {
            timestamp: "2026-05-22T02:00:02.000Z",
            type: "response_item",
            payload: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: "Use real Orbit data for validation." }]
            }
          },
          {
            timestamp: "2026-05-22T02:00:03.000Z",
            type: "response_item",
            payload: {
              type: "function_call",
              name: "exec_command",
              call_id: "call-real",
              arguments: "{\"cmd\":\"pnpm test\"}"
            }
          },
          {
            timestamp: "2026-05-22T02:00:04.000Z",
            type: "response_item",
            payload: {
              type: "function_call_output",
              call_id: "call-real",
              output: "tests passed"
            }
          },
          {
            timestamp: "2026-05-22T02:00:05.000Z",
            type: "event_msg",
            payload: { type: "token_count", info: { total: 123 } }
          },
          {
            timestamp: "2026-05-22T02:00:06.000Z",
            type: "response_item",
            payload: { type: "reasoning", encrypted_content: "sealed" }
          },
          {
            timestamp: "2026-05-22T02:00:07.000Z",
            type: "turn_context",
            payload: { cwd: "/Users/example/Documents/project/orbit" }
          }
        ]
          .map((record) => JSON.stringify(record))
          .join("\n")
      );

      const adapter = new CodexAdapter({ path: directory, id: "codex_payload_test" });
      const result = await adapter.readCursor();
      expect(result.events).toHaveLength(4);
      expect(result.nextCursor).toBe("8");
      expect(result.events.map((event) => event.type)).toEqual([
        "system",
        "message",
        "command",
        "command"
      ]);
      expect(result.events[0]?.content.title).toBe("Codex session started: orbit");
      expect(result.events[0]?.context.project).toBe("orbit");
      expect(result.events[1]?.actor?.role).toBe("user");
      expect(result.events[1]?.context.project).toBe("orbit");
      expect(result.events[1]?.content.text).toBe("Use real Orbit data for validation.");
      expect(result.events[2]?.content.metadata?.toolName).toBe("exec_command");
      expect(result.events[3]?.content.text).toBe("tests passed");
      expect(result.events.some((event) => event.content.text === "Hidden runtime instructions")).toBe(
        false
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
