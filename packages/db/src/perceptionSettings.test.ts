import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { openOrbitDatabase } from "./connection";
import { AuditRepository } from "./repositories/auditRepository";
import { SourceRepository } from "./repositories/sourceRepository";
import type { SourceRecord } from "@orbit/core";
import {
  readPerceptionStatus,
  updatePerceptionProviderRoute,
  updatePerceptionSamplingPreset,
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
        "perception.source_enabled",
        "perception.permission_checked",
        "perception.policy_changed",
        "perception.source_disabled"
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
        "perception.policy_changed"
      );
    } finally {
      close();
    }
  });

  it("persists sampling preset settings and updates the policy snapshot", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-perception-sampling-test-"));
    tempDirs.push(orbitHome);
    const { db, close } = openOrbitDatabase({ orbitHome });
    try {
      const updated = updatePerceptionSamplingPreset(db, "balanced");
      expect(updated.samplingPreset.name).toBe("balanced");
      expect(updated.samplingPolicy.minimumBurstIntervalSeconds).toBe(60);
      expect(updated.samplingPolicy.framesPerBurst).toBe(4);

      const reread = readPerceptionStatus(db);
      expect(reread.samplingPreset.name).toBe("balanced");
      expect(reread.policySnapshot.id).toBe(updated.policySnapshot.id);
      expect(new AuditRepository(db).listAuditLogs().map((log) => log.operation)).toContain(
        "perception.policy_changed"
      );
    } finally {
      close();
    }
  });

  it("stores policy snapshot ids on runtime and policy audit decisions", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-perception-policy-snapshot-test-"));
    tempDirs.push(orbitHome);
    const { db, close } = openOrbitDatabase({ orbitHome });
    try {
      updatePerceptionSourceRuntime(db, "screen", "enable");
      updatePerceptionSourcePolicy(db, "screen", {
        canStoreRaw: true,
        rawRetentionTtlMinutes: 60
      });

      const logs = new AuditRepository(db).listAuditLogs();
      const sourceEnabled = logs.find((log) => log.operation === "perception.source_enabled");
      const policyChanged = logs.find((log) => log.operation === "perception.policy_changed");

      expect(JSON.stringify(sourceEnabled?.details)).toContain("policySnapshotId");
      expect(JSON.stringify(policyChanged?.details)).toContain("policySnapshotId");
      expect(JSON.stringify(policyChanged?.details)).toContain("perception_policy_");
    } finally {
      close();
    }
  });

  it("syncs existing perception source records when source export policy changes", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-perception-source-sync-test-"));
    tempDirs.push(orbitHome);
    const { db, close } = openOrbitDatabase({ orbitHome });
    try {
      const sources = new SourceRepository(db);
      sources.upsertSource(makePerceptionSource("perception_screen", "screen"));

      updatePerceptionSourcePolicy(db, "screen", {
        canExportToAgent: true,
        canUseForAI: true
      });

      const source = sources.getSource("perception_screen");
      expect(source?.permissionScope.canExportToAgent).toBe(true);
      expect(source?.permissionScope.canUseForAI).toBe(true);
      expect(source?.permissionScope.retentionPolicyId).toBe("perception_summary_only");
    } finally {
      close();
    }
  });
});

function makePerceptionSource(id: string, kind: "screen" | "ocr"): SourceRecord {
  return {
    id,
    kind,
    displayName: id,
    enabled: true,
    paused: false,
    defaultSensitivity: "confidential",
    permissionScope: {
      sourceKind: kind,
      readableFields: ["title", "summary", "timestamp", "app", "project"],
      canStoreRaw: false,
      canStoreSummary: true,
      canUseForAI: false,
      canExportToAgent: false,
      retentionPolicyId: "perception_summary_only"
    },
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z"
  };
}
