import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SeaTalkAdapter } from "./seatalk/seatalkAdapter";

describe("SeaTalkAdapter", () => {
  it("only reads approved user-provided imports", async () => {
    const directory = mkdtempSync(join(tmpdir(), "orbit-seatalk-import-"));
    writeFileSync(
      join(directory, "messages.jsonl"),
      [
        {
          sourceKind: "seatalk",
          occurredAt: "2026-05-22T09:00:00.000Z",
          type: "message",
          title: "Project discussion",
          text: "Discussed Orbit context follow-up.",
          context: { threadId: "chat-1" }
        },
        {
          sourceKind: "seatalk",
          occurredAt: "2026-05-22T09:05:00.000Z",
          type: "todo",
          title: "Follow up",
          text: "Confirm next steps.",
          sensitivity: "confidential"
        }
      ]
        .map((record) => JSON.stringify(record))
        .join("\n")
    );
    const adapter = new SeaTalkAdapter({
      approvedImportDirectory: directory,
      id: "seatalk_test"
    });

    try {
      const result = await adapter.readCursor();
      expect(result.events).toHaveLength(2);
      expect(result.nextCursor).toBe("2");
      expect(result.events.every((event) => event.source.kind === "seatalk")).toBe(true);
      expect(result.events[0]?.source.pointer).toContain("seatalk://approved-import/");
      expect(result.events.every((event) => event.privacy.sensitivity === "confidential")).toBe(
        true
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
