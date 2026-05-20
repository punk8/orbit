import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("desktop e2e smoke script", () => {
  it("uses install-app-deps arguments supported by electron-builder 25", () => {
    const script = readFileSync(new URL("./e2e-smoke.mjs", import.meta.url), "utf8");

    expect(script).toContain('"install-app-deps"');
    expect(script).not.toContain('"install-app-deps", "--config"');
  });
});
