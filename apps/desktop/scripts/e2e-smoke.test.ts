import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("desktop e2e smoke script", () => {
  it("uses install-app-deps arguments supported by electron-builder 25", () => {
    const script = readFileSync(new URL("./e2e-smoke.mjs", import.meta.url), "utf8");

    expect(script).toContain('"install-app-deps"');
    expect(script).toContain("ORBIT_E2E_RENDERER_SMOKE");
    expect(script).not.toContain('"install-app-deps", "--config"');
  });

  it("uses shared native rebuild and packaged smoke scripts", () => {
    const packageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    const e2eSmoke = readFileSync(new URL("./e2e-smoke.mjs", import.meta.url), "utf8");
    const packageDesktop = readFileSync(
      new URL("./package-desktop.mjs", import.meta.url),
      "utf8"
    );
    const rebuildNative = readFileSync(new URL("./rebuild-native.mjs", import.meta.url), "utf8");

    expect(packageJson).toContain("scripts/rebuild-native.mjs electron");
    expect(packageJson).toContain("scripts/rebuild-native.mjs node");
    expect(packageJson).toContain("scripts/package-smoke.mjs");
    expect(packageJson).toContain("scripts/package-desktop.mjs dir");
    expect(packageJson).toContain("scripts/package-desktop.mjs dmg");
    expect(packageJson).toContain("package:smoke");
    expect(e2eSmoke).toContain("scripts/rebuild-native.mjs");
    expect(e2eSmoke).toContain("finally");
    expect(packageDesktop).toContain("scripts/rebuild-native.mjs");
    expect(packageDesktop).toContain("finally");
    expect(packageDesktop).toContain('"electron-builder"');
    expect(packageDesktop).toContain('"--dir"');
    expect(packageDesktop).toContain('"--mac"');
    expect(packageDesktop).toContain('"dmg"');
    expect(rebuildNative).toContain("ORBIT_NATIVE_REBUILD_LOCK_TIMEOUT_MS");
    expect(rebuildNative).toContain("EEXIST");
    expect(rebuildNative).toContain("Atomics.wait");
  });
});
