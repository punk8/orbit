import { describe, expect, it } from "vitest";
import { assertReviewTransition, createStableId, hashObject, stableStringify } from "./index";

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
});
