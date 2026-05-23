import { describe, expect, it } from "vitest";
import { createDefaultPerceptionStatus } from "@orbit/core";
import { evaluatePerceptionReleaseGate, redactSecrets } from "./index";

describe("privacy redaction", () => {
  it("redacts common secrets and private identifiers", () => {
    const redacted = redactSecrets(
      [
        "authorization: bearer token-123",
        "api_key=sk-test",
        "password=hunter2",
        "person@example.com",
        "https://example.com/private",
        "/Users/alice/project/.env"
      ].join("\n")
    );

    expect(redacted).not.toContain("token-123");
    expect(redacted).not.toContain("sk-test");
    expect(redacted).not.toContain("hunter2");
    expect(redacted).not.toContain("person@example.com");
    expect(redacted).not.toContain("example.com/private");
    expect(redacted).not.toContain("/Users/alice");
  });
});

describe("perception release gate", () => {
  it("passes disabled-by-default perception invariants and reports audit smoke data separately", () => {
    const report = evaluatePerceptionReleaseGate({
      perception: createDefaultPerceptionStatus(),
      cleanup: {
        scannedEvents: 0,
        cleanedEvents: 0,
        removedRawRefs: 0,
        removedAttachments: 0,
        deletedLocalSidecars: 0,
        preservedSummaries: 0
      },
      auditOperations: [],
      packaging: {
        excludesTmp: true,
        excludesFixtures: true,
        nativeHelperMode: "mock",
        signed: false,
        notarized: false
      }
    });

    expect(report.status).toBe("pass");
    expect(report.checks.find((check) => check.id === "no_default_capture")?.status).toBe("pass");
    expect(report.checks.find((check) => check.id === "audit_review")?.status).toBe("needs_data");
  });

  it("passes permission-granted Screen/OCR dogfood auto-start without treating it as unsafe default capture", () => {
    const perception = createDefaultPerceptionStatus([
      {
        sourceKind: "screen",
        enabled: true,
        paused: false,
        userIntent: "auto",
        permissionStatuses: { screen: "granted" }
      },
      {
        sourceKind: "ocr",
        enabled: true,
        paused: false,
        userIntent: "auto",
        permissionStatuses: { screen: "granted" }
      }
    ]);
    const report = evaluatePerceptionReleaseGate({
      perception,
      cleanup: {
        scannedEvents: 0,
        cleanedEvents: 0,
        removedRawRefs: 0,
        removedAttachments: 0,
        deletedLocalSidecars: 0,
        preservedSummaries: 0
      },
      auditOperations: ["perception.permission_granted", "perception.runtime_auto_started"],
      packaging: {
        excludesTmp: true,
        excludesFixtures: true,
        nativeHelperMode: "mock",
        signed: false,
        notarized: false
      }
    });

    expect(report.status).toBe("pass");
    expect(report.checks.find((check) => check.id === "no_default_capture")?.status).toBe("pass");
  });

  it("fails when raw sidecars or external providers are enabled by default", () => {
    const perception = createDefaultPerceptionStatus(
      [
        {
          sourceKind: "screen",
          enabled: true,
          policy: { canStoreRaw: true, rawRetentionTtlMinutes: 60 }
        }
      ],
      [
        {
          task: "vision",
          provider: "openai-compatible",
          enabled: true,
          allowExternal: true
        }
      ]
    );
    const report = evaluatePerceptionReleaseGate({ perception });

    expect(report.status).toBe("fail");
    expect(report.checks.find((check) => check.id === "no_default_capture")?.status).toBe("fail");
    expect(report.checks.find((check) => check.id === "raw_storage_default_off")?.status).toBe(
      "fail"
    );
  });

  it("allows an explicitly unsigned packaged Alpha helper while still reporting signing blockers", () => {
    const report = evaluatePerceptionReleaseGate({
      perception: createDefaultPerceptionStatus(),
      cleanup: {
        scannedEvents: 0,
        cleanedEvents: 0,
        removedRawRefs: 0,
        removedAttachments: 0,
        deletedLocalSidecars: 0,
        preservedSummaries: 0
      },
      auditOperations: [],
      packaging: {
        excludesTmp: true,
        excludesFixtures: true,
        nativeHelperMode: "unsigned",
        signed: false,
        notarized: false,
        privateDataScan: { scanned: 3, violations: [] }
      }
    });

    expect(report.status).toBe("pass");
    expect(report.packaging.nativeHelperMode).toBe("unsigned");
    expect(report.checks.find((check) => check.id === "packaging_policy")?.status).toBe(
      "needs_data"
    );
    expect(
      report.checks.find((check) => check.id === "packaging_policy")?.details
    ).toMatchObject({
      signingBlocker: "missing_apple_developer_credentials"
    });
  });

  it("reports Alpha dogfood manual smoke coverage without failing automated release gates", () => {
    const report = evaluatePerceptionReleaseGate({
      perception: createDefaultPerceptionStatus(),
      cleanup: {
        scannedEvents: 0,
        cleanedEvents: 0,
        removedRawRefs: 0,
        removedAttachments: 0,
        deletedLocalSidecars: 0,
        preservedSummaries: 0
      },
      auditOperations: [],
      packaging: {
        excludesTmp: true,
        excludesFixtures: true,
        nativeHelperMode: "unsigned",
        signed: false,
        notarized: false,
        privateDataScan: { scanned: 3, violations: [] }
      },
      manualSmoke: {
        screenRecordingPermission: "passed",
        autoStart: "passed",
        pauseResumeStop: "passed",
        permissionRevoke: "needs_data",
        restartAutoResume: "needs_data",
        resourcePause: "needs_data",
        protectedContext: "passed",
        auditReview: "passed",
        cleanup: "passed",
        handoffExclusion: "needs_data"
      }
    });

    expect(report.status).toBe("pass");
    expect(report.manualSmoke.completed).toEqual([
      "screenRecordingPermission",
      "autoStart",
      "pauseResumeStop",
      "protectedContext",
      "auditReview",
      "cleanup"
    ]);
    expect(report.manualSmoke.missing).toEqual([
      "permissionRevoke",
      "restartAutoResume",
      "resourcePause",
      "handoffExclusion"
    ]);
    expect(report.checks.find((check) => check.id === "manual_smoke")?.status).toBe(
      "needs_data"
    );
  });

  it("fails release gate when manual smoke evidence explicitly records a failed required check", () => {
    const report = evaluatePerceptionReleaseGate({
      perception: createDefaultPerceptionStatus(),
      cleanup: {
        scannedEvents: 0,
        cleanedEvents: 0,
        removedRawRefs: 0,
        removedAttachments: 0,
        deletedLocalSidecars: 0,
        preservedSummaries: 0
      },
      auditOperations: [],
      packaging: {
        excludesTmp: true,
        excludesFixtures: true,
        nativeHelperMode: "unsigned",
        signed: false,
        notarized: false,
        privateDataScan: { scanned: 3, violations: [] }
      },
      manualSmoke: {
        screenRecordingPermission: "passed",
        autoStart: "passed",
        pauseResumeStop: "passed",
        permissionRevoke: "passed",
        restartAutoResume: "passed",
        resourcePause: "passed",
        protectedContext: "failed",
        auditReview: "passed",
        cleanup: "passed",
        handoffExclusion: "passed"
      }
    });

    expect(report.status).toBe("fail");
    expect(report.manualSmoke.failed).toEqual(["protectedContext"]);
    expect(report.checks.find((check) => check.id === "manual_smoke")).toMatchObject({
      status: "fail",
      nextAction: "rerun_failed_manual_smoke"
    });
  });

  it("reports source-install next actions for missing manual smoke, audit data, and signing evidence", () => {
    const report = evaluatePerceptionReleaseGate({
      perception: createDefaultPerceptionStatus(),
      cleanup: {
        scannedEvents: 0,
        cleanedEvents: 0,
        removedRawRefs: 0,
        removedAttachments: 0,
        deletedLocalSidecars: 0,
        preservedSummaries: 0
      },
      auditOperations: [],
      packaging: {
        excludesTmp: true,
        excludesFixtures: true,
        nativeHelperMode: "unsigned",
        signed: false,
        notarized: false,
        privateDataScan: { scanned: 3, violations: [] }
      }
    });

    expect(report.nextActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "manual_smoke.record_evidence",
          command: expect.stringContaining("ORBIT_ALPHA_MANUAL_SMOKE")
        }),
        expect.objectContaining({
          id: "audit_review.exercise_missing_groups",
          command: "pnpm --filter @orbit/cli orbit perception audit-review --json"
        }),
        expect.objectContaining({
          id: "packaging_policy.provide_apple_credentials"
        })
      ])
    );
    expect(report.checks.find((check) => check.id === "manual_smoke")).toMatchObject({
      nextAction: "record_source_install_manual_smoke"
    });
  });
});
