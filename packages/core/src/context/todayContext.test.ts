import { describe, expect, it } from "vitest";
import { getLocalDateKey, isInLocalDate } from "./todayContext";

describe("today context date helpers", () => {
  it("formats local date keys without UTC rollover", () => {
    expect(getLocalDateKey(new Date(2026, 4, 21, 1, 30))).toBe("2026-05-21");
  });

  it("matches ISO timestamps against the user's local day", () => {
    const localMorning = new Date(2026, 4, 21, 9, 0).toISOString();
    const nextDay = new Date(2026, 4, 22, 0, 30).toISOString();

    expect(isInLocalDate("2026-05-21", localMorning)).toBe(true);
    expect(isInLocalDate("2026-05-21", nextDay)).toBe(false);
  });
});
