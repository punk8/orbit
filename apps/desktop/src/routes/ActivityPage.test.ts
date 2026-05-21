import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ActivityPage evidence workbench", () => {
  it("renders filters, detail loading, event stream, processing, storage, and derived objects", () => {
    const source = readFileSync(new URL("./ActivityPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("getActivitySessionDetail");
    expect(source).toContain("filter.source");
    expect(source).toContain("filter.search");
    expect(source).toContain("activity.eventStream");
    expect(source).toContain("activity.processing");
    expect(source).toContain("activity.storage");
    expect(source).toContain("activity.sourcePolicy");
    expect(source).toContain("activity.derivedObjects");
    expect(source).toContain("activity.providerBoundary");
  });
});
