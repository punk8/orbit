import { describe, expect, it } from "vitest";
import type { Event, SourceAdapter } from "./index";
import {
  assertReviewTransition,
  createStableId,
  defaultPermissionScopeForSource,
  hashObject,
  ingestEventsFromAdapter,
  stableStringify
} from "./index";

describe("core helpers", () => {
  it("stableStringify sorts object keys", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it("hashObject is deterministic", () => {
    expect(hashObject({ source: "codex", id: "1" })).toBe(hashObject({ id: "1", source: "codex" }));
  });

  it("createStableId includes prefix", () => {
    expect(createStableId("event", { id: "abc" })).toMatch(/^event_[a-f0-9]{24}$/);
  });

  it("rejects invalid review transitions", () => {
    expect(() => assertReviewTransition("rejected", "confirmed")).toThrow(
      /Invalid review status transition/
    );
  });

  it("redacts sensitive event text during ingestion", async () => {
    const stored: Event[] = [];
    const adapter = makeAdapter([
      {
        ...makeEvent("1"),
        content: {
          title: "Token captured",
          text: "authorization: bearer test-token and user@example.com"
        }
      }
    ]);

    const result = await ingestEventsFromAdapter(adapter, {
      upsertEvent(event) {
        stored.push(event);
        return true;
      }
    });

    expect(result.warnings[0]).toContain("redacted");
    expect(stored[0]?.content.text).toBeUndefined();
    expect(stored[0]?.content.summary).not.toContain("test-token");
    expect(stored[0]?.content.summary).not.toContain("user@example.com");
    expect(stored[0]?.privacy.redactionState).toBe("redacted");
  });

  it("rejects adapters without declared permission scope", async () => {
    const adapter = {
      ...makeAdapter([makeEvent("1")]),
      permissionScope: undefined
    } as unknown as SourceAdapter;

    await expect(
      ingestEventsFromAdapter(adapter, {
        upsertEvent() {
          return true;
        }
      })
    ).rejects.toThrow("did not declare a permission scope");
  });
});

function makeAdapter(events: Event[]): SourceAdapter {
  return {
    id: "fixture_codex",
    kind: "codex",
    displayName: "Fixture Codex",
    capabilities: ["incremental_read"],
    defaultSensitivity: "internal",
    permissionScope: defaultPermissionScopeForSource("codex", "internal"),
    async readCursor() {
      return { events, nextCursor: String(events.length) };
    }
  };
}

function makeEvent(id: string): Event {
  return {
    id: `event_${id}`,
    schemaVersion: 1,
    source: {
      kind: "codex",
      adapterId: "fixture_codex",
      externalId: id,
      pointer: `fixture://codex/day#${id}`
    },
    occurredAt: `2026-05-20T09:0${id}:00.000Z`,
    observedAt: `2026-05-20T09:0${id}:00.000Z`,
    context: {
      app: "Codex",
      project: "orbit"
    },
    type: "message",
    content: {
      title: "Fixture event"
    },
    privacy: {
      sensitivity: "internal",
      retentionPolicyId: "default",
      redactionState: "none"
    },
    hash: `hash_${id}`
  };
}
