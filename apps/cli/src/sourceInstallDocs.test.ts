import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repoRoot = new URL("../../../", import.meta.url);

function readRepoFile(path: string): string {
  return readFileSync(new URL(path, repoRoot), "utf8");
}

describe("source install dogfood guide", () => {
  it("keeps the trusted-user install path discoverable from README and docs", () => {
    const rootReadmePath = new URL("README.md", repoRoot);
    expect(existsSync(rootReadmePath)).toBe(true);

    const rootReadme = readRepoFile("README.md");
    const guide = readRepoFile("docs/source-install-dogfood.md");
    const manualSmoke = readRepoFile("docs/source-install-manual-smoke.md");
    const spec = readRepoFile("docs/source-install-dogfood-production-spec.md");

    expect(rootReadme).toContain("docs/source-install-dogfood.md");
    expect(rootReadme).toContain("docs/source-install-manual-smoke.md");
    expect(rootReadme).toContain("docs/source-install-dogfood-production-spec.md");
    expect(spec).toContain("Goal N: Source Install And Local Verification Path");
    expect(spec).toContain("source-install:verify");

    expect(guide).toContain("# Source Install Dogfood Guide");
    expect(guide).toContain("docs/source-install-dogfood-production-spec.md");
    expect(guide).toContain("macOS 14");
    expect(guide).toContain("Node.js 22");
    expect(guide).toContain("pnpm 10.14.0");
    expect(guide).toContain("Xcode Command Line Tools");
    expect(guide).toContain("Screen Recording");
    expect(guide).toContain('ORBIT_HOME="$PWD/.tmp/source-install-dogfood"');
    expect(guide).toContain("pnpm install");
    expect(guide).toContain("pnpm test");
    expect(guide).toContain("pnpm typecheck");
    expect(guide).toContain("pnpm lint");
    expect(guide).toContain("pnpm --filter @orbit/desktop build");
    expect(guide).toContain("pnpm --filter @orbit/desktop package:dir");
    expect(guide).toContain("pnpm --filter @orbit/desktop package:smoke");
    expect(guide).toContain("pnpm source-install:verify");
    expect(guide).toContain("pnpm --filter @orbit/desktop rebuild:native:electron");
    expect(guide).toContain("pnpm --filter @orbit/desktop rebuild:native:node");
    expect(guide).toContain("Native module ABI mismatch");
    expect(guide).toContain("Killed native rebuild lock");
    expect(guide).toContain("Missing Screen Recording permission");
    expect(guide).toContain("Packaged helper missing");
    expect(guide).toContain("SQLite lock");
    expect(guide).toContain("Stale ORBIT_HOME");

    expect(manualSmoke).toContain("# Source Install Manual macOS Smoke");
    expect(manualSmoke).toContain("screenRecordingPermission=passed");
    expect(manualSmoke).toContain("handoffExclusion=passed");
    expect(manualSmoke).toContain("screenRecordingPermission");
    expect(manualSmoke).toContain("autoStart");
    expect(manualSmoke).toContain("pauseResumeStop");
    expect(manualSmoke).toContain("permissionRevoke");
    expect(manualSmoke).toContain("restartAutoResume");
    expect(manualSmoke).toContain("resourcePause");
    expect(manualSmoke).toContain("protectedContext");
    expect(manualSmoke).toContain("auditReview");
    expect(manualSmoke).toContain("cleanup");
    expect(manualSmoke).toContain("handoffExclusion");
    expect(manualSmoke).toContain("failed");
    expect(manualSmoke).toContain("needs_data");
  });

  it("provides one safe non-interactive source install verification script", () => {
    const packageJson = JSON.parse(readRepoFile("package.json")) as {
      scripts: Record<string, string>;
    };
    const script = readRepoFile("scripts/source-install-verify.mjs");

    expect(packageJson.scripts["source-install:verify"]).toBe(
      "node scripts/source-install-verify.mjs"
    );
    expect(script).toContain("source-install-release-gate");
    expect(script).toContain('"test"');
    expect(script).toContain('"typecheck"');
    expect(script).toContain('"lint"');
    expect(script).toContain('"--filter", "@orbit/desktop", "build"');
    expect(script).toContain('"--filter", "@orbit/desktop", "package:dir"');
    expect(script).toContain('"--filter", "@orbit/desktop", "package:smoke"');
    expect(script).toContain('"--filter", "@orbit/cli", "orbit", "perception", "release-gate"');
    expect(script).toContain("ORBIT_HOME");
    expect(script).not.toContain("/tmp/orbit-dogfood-clean");
  });
});
