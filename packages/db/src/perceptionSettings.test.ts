import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { openOrbitDatabase } from "./connection";
import { AuditRepository } from "./repositories/auditRepository";
import {
  readPerceptionStatus,
  updatePerceptionProviderRoute,
  updatePerceptionSourcePolicy,
  updatePerceptionSourceRuntime
} from "./perceptionSettings";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("perception control-plane settings", () => {
  it("keeps Goal 8A sources disabled by default", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-perception-default-test-"));
    tempDirs.push(orbitHome);
    const { db, close } = openOrbitDatabase({ orbitHome });
    try {
      const status = readPerceptionStatus(db);

      expect(status.status).toBe("disabled");
      expect(status.sources.map((source) => source.sourceKind)).toEqual([
        "screen",
        "ocr",
        "vision",
        "microphone_audio",
        "system_audio",
        "transcript"
      ]);
      expect(status.sources.every((source) => source.enabled === false)).toBe(true);
      expect(status.providerRoutes.map((route) => route.provider)).toEqual([
        "disabled",
        "disabled",
        "disabled"
      ]);
    } finally {
      close();
    }
  });

  it("updates source runtime and policy with audit logs", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-perception-runtime-test-"));
    tempDirs.push(orbitHome);
    const { db, close } = openOrbitDatabase({ orbitHome });
    try {
      const enabled = updatePerceptionSourceRuntime(db, "screen", "enable");
      expect(enabled.status).toBe("needs_permission");
      expect(enabled.sources.find((source) => source.sourceKind === "screen")?.status).toBe(
        "needs_permission"
      );

      const updated = updatePerceptionSourcePolicy(db, "screen", {
        canUseForAI: true,
        canExportToAgent: true
      });
      const screen = updated.sources.find((source) => source.sourceKind === "screen");
      expect(screen?.policy.canUseForAI).toBe(true);
      expect(screen?.policy.canExportToAgent).toBe(true);

      const disabled = updatePerceptionSourceRuntime(db, "screen", "disable");
      expect(disabled.sources.find((source) => source.sourceKind === "screen")?.status).toBe(
        "disabled"
      );

      const operations = new AuditRepository(db).listAuditLogs().map((log) => log.operation);
      expect(operations).toEqual([
        "perception.enable",
        "perception.permission_check",
        "perception.policy_change",
        "perception.disable"
      ]);
    } finally {
      close();
    }
  });

  it("updates provider routing without enabling capture", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-perception-provider-test-"));
    tempDirs.push(orbitHome);
    const { db, close } = openOrbitDatabase({ orbitHome });
    try {
      const status = updatePerceptionProviderRoute(db, "vision", "mock");
      const vision = status.providerRoutes.find((route) => route.task === "vision");

      expect(vision?.provider).toBe("mock");
      expect(vision?.enabled).toBe(true);
      expect(status.enabled).toBe(false);
      expect(status.sources.every((source) => source.status === "disabled")).toBe(true);
      expect(new AuditRepository(db).listAuditLogs().map((log) => log.operation)).toContain(
        "perception.provider_route.update"
      );
    } finally {
      close();
    }
  });
});
