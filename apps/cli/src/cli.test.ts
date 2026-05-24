import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { buildProgram } from "./index";
import { listAgentResources, readAgentResource } from "./commands/agent";
import { ingestCodex } from "./commands/ingestCodex";
import { ingestLocalAgent } from "./commands/ingestLocalAgent";
import { runKnowledgeReviewAction, runMemoryReviewAction } from "./commands/governanceActions";
import { getTodayHandoff, getTodayHandoffMarkdown } from "./commands/handoff";
import {
  getObservePermissions,
  getObserveProtectedApps,
  getObserveStatus,
  upsertObserveProtectedRule
} from "./commands/observe";
import {
  cleanupPerceptionRawSidecars,
  deletePerceptionEvents,
  disablePerceptionSourceAndDeleteRaw,
  captureScreenOcrBurstNow,
  captureScreenOcrOnce,
  getPerceptionReleaseGate,
  getPerceptionStatus,
  ignoreCurrentPerceptionContext,
  setPerceptionProtectedRule,
  setPerceptionSamplingPreset,
  syncPerceptionDogfoodPermission
} from "./commands/perception";
import { getDogfoodReadiness } from "./commands/dogfood";
import {
  openOrbitDatabase,
  SettingsRepository,
  updatePerceptionProviderRoute,
  updatePerceptionSourcePolicy
} from "@orbit/db";
import {
  getProjectContext,
  getTodayContext,
  listActivitySessions,
  listKnowledgeArtifacts,
  listMemories,
  listRecommendations,
  searchKnowledgeArtifacts,
  searchMemories
} from "./commands/readModels";
import { getActivityFrames, getActivityPlayback } from "./commands/activityPlayback";
import { getStatus } from "./commands/status";
import { getAIStatus, testAITask } from "./commands/ai";
import { screenPermission } from "@orbit/adapters";

const tempDirs: string[] = [];

afterEach(() => {
  delete process.env.ORBIT_HOME;
  delete process.env.ORBIT_AI_PROVIDER;
  delete process.env.ORBIT_OPENAI_BASE_URL;
  delete process.env.ORBIT_OPENAI_MODEL;
  delete process.env.ORBIT_OPENAI_API_KEY;
  delete process.env.ORBIT_ALPHA_MANUAL_SMOKE;
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createCodexImportDirectory(prefix: string, date = "2026-05-20"): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(directory);
  writeFileSync(join(directory, "malformed.jsonl"), "{bad json\n");
  writeJsonl(join(directory, "session.jsonl"), [
    {
      timestamp: `${date}T09:00:00.000Z`,
      type: "message",
      role: "user",
      text: "Review Orbit product context and current status.",
      project: "orbit"
    },
    {
      timestamp: `${date}T09:05:00.000Z`,
      type: "command",
      command: "pnpm test",
      project: "orbit"
    },
    {
      timestamp: `${date}T09:10:00.000Z`,
      type: "test_result",
      summary: "Orbit tests passed for the local import path.",
      project: "orbit"
    },
    {
      timestamp: `${date}T11:00:00.000Z`,
      type: "decision",
      title: "Use real source imports for validation",
      text: "Decision: validate Orbit with explicit user-provided local source data.",
      project: "orbit"
    },
    {
      timestamp: `${date}T16:00:00.000Z`,
      type: "todo",
      title: "Follow up on source permissions",
      text: "Next: confirm real source permissions before enabling background collection.",
      project: "orbit"
    }
  ]);
  return directory;
}

function createLocalAgentImportDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(directory);
  writeFileSync(join(directory, "malformed.jsonl"), "{bad json\n");
  writeJsonl(join(directory, "agent-session.jsonl"), [
    {
      timestamp: "2026-05-20T10:00:00.000Z",
      type: "message",
      role: "user",
      text: "Inspect local agent context.",
      project: "orbit"
    },
    {
      timestamp: "2026-05-20T10:05:00.000Z",
      type: "command",
      command: "pnpm typecheck",
      project: "orbit"
    },
    {
      timestamp: "2026-05-20T10:10:00.000Z",
      type: "code_change",
      title: "Update local source adapter",
      project: "orbit"
    },
    {
      timestamp: "2026-05-20T10:15:00.000Z",
      type: "test_result",
      summary: "Typecheck passed.",
      project: "orbit"
    },
    {
      timestamp: "2026-05-20T10:20:00.000Z",
      type: "decision",
      title: "Keep local agent import read-only",
      project: "orbit"
    }
  ]);
  return directory;
}

function writeJsonl(path: string, records: Array<Record<string, unknown>>): void {
  writeFileSync(path, records.map((record) => JSON.stringify(record)).join("\n"));
}

describe("cli commands", () => {
  it("ingests explicit Codex imports and reports status", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const codexPath = createCodexImportDirectory("orbit-cli-codex-import-");
    const first = await ingestCodex(codexPath);
    expect(first.inserted).toBe(5);

    const second = await ingestCodex(codexPath);
    expect(second.inserted).toBe(0);

    const status = getStatus();
    expect(status.counts.sources).toBe(1);
    expect(status.counts.events).toBe(5);
    expect(status.counts.activitySessions).toBeGreaterThan(0);
    expect(status.counts.knowledgeArtifacts).toBeGreaterThan(0);
    expect(status.counts.memories).toBe(0);
    expect(status.counts.recommendations).toBeGreaterThanOrEqual(0);

    expect(first.pipeline.activitySessions.total).toBeGreaterThan(0);
    expect(first.pipeline.knowledgeArtifacts.total).toBeGreaterThan(0);
    expect(first.pipeline.memories.total).toBe(0);

    expect(listActivitySessions().length).toBeGreaterThan(0);
    const artifacts = listKnowledgeArtifacts();
    expect(artifacts.length).toBeGreaterThan(0);
    expect(listMemories()).toHaveLength(0);
    expect(searchKnowledgeArtifacts("Orbit")).not.toHaveLength(0);
    expect(getTodayContext("2026-05-20").activitySessions.length).toBeGreaterThan(0);
    expect(getProjectContext("orbit").knowledgeArtifacts).toHaveLength(0);

    const reviewResult = runKnowledgeReviewAction(artifacts[0]!.id, "confirm");
    expect(reviewResult.artifact.status).toBe("confirmed");
    expect(reviewResult.generatedMemories.length).toBeGreaterThanOrEqual(0);
    if (reviewResult.generatedMemories.length > 0) {
      expect(listMemories().length).toBeGreaterThan(0);
      expect(searchMemories("Orbit")).not.toHaveLength(0);
    }
    expect(getProjectContext("orbit").knowledgeArtifacts).toHaveLength(1);

    const third = await ingestCodex(codexPath);
    expect(third.inserted).toBe(0);
    expect(
      listKnowledgeArtifacts().find((artifact) => artifact.id === artifacts[0]!.id)?.status
    ).toBe("confirmed");
    expect(listMemories().length).toBeGreaterThanOrEqual(0);
  });

  it("generates handoff packs and registers handoff commands", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-handoff-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    await ingestCodex(createCodexImportDirectory("orbit-cli-handoff-codex-"));
    const artifacts = listKnowledgeArtifacts();
    const review = runKnowledgeReviewAction(artifacts[0]!.id, "confirm");
    if (review.generatedMemories[0]) {
      runMemoryReviewAction(review.generatedMemories[0].id, "confirm");
    }

    const pack = getTodayHandoff({
      date: "2026-05-20",
      generatedAt: "2026-05-21T08:00:00.000Z"
    });
    expect(pack.kind).toBe("today");
    expect(pack.recentActivity.length).toBeGreaterThan(0);
    expect(pack.confirmedKnowledge.length).toBeGreaterThan(0);
    expect(pack.activeMemories.length).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(pack)).not.toContain("RAW_EVENT_TEXT");

    const markdown = getTodayHandoffMarkdown({ date: "2026-05-20" });
    expect(markdown).toContain("# Orbit Handoff");
    expect(markdown).toContain("## Evidence Index");

    const program = buildProgram();
    const help = program.helpInformation();
    const handoffHelp = program.commands
      .find((command) => command.name() === "handoff")
      ?.helpInformation();
    expect(help).toContain("handoff");
    expect(handoffHelp).toContain("today");
    expect(handoffHelp).toContain("project");
  });

  it("exposes read-only agent resources for safe handoff reads", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-agent-resource-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    await ingestCodex(createCodexImportDirectory("orbit-cli-agent-codex-"));
    const artifacts = listKnowledgeArtifacts();
    const review = runKnowledgeReviewAction(artifacts[0]!.id, "confirm");
    if (review.generatedMemories[0]) {
      runMemoryReviewAction(review.generatedMemories[0].id, "confirm");
    }

    const resources = listAgentResources();
    expect(resources.map((resource) => resource.uri)).toEqual(
      expect.arrayContaining(["orbit://handoff/today", "orbit://context/today", "orbit://status"])
    );
    expect(resources.every((resource) => resource.readOnly)).toBe(true);

    const handoffResource = readAgentResource("orbit://handoff/today", {
      date: "2026-05-20",
      generatedAt: "2026-05-21T08:00:00.000Z"
    });
    expect(handoffResource.descriptor.uri).toBe("orbit://handoff/today");
    expect(handoffResource.readyForAgent).toBe(true);
    expect(handoffResource.content).toContain("# Orbit Handoff");

    const contextResource = readAgentResource("orbit://context/today", {
      date: "2026-05-20"
    });
    expect(contextResource.descriptor.uri).toBe("orbit://context/today");
    if (!("included" in contextResource)) {
      throw new Error("Expected today context agent resource.");
    }
    expect(contextResource.readyForAgent).toBe(true);
    expect(contextResource.content).toContain('"date": "2026-05-20"');
    expect(contextResource.included.activity).toBeGreaterThan(0);

    const statusResource = readAgentResource("orbit://status");
    expect(statusResource.descriptor.uri).toBe("orbit://status");
    if (!("status" in statusResource)) {
      throw new Error("Expected status agent resource.");
    }
    expect(statusResource.readyForAgent).toBe(true);
    expect(statusResource.content).toContain('"activitySessions":');
    expect(statusResource.status.counts.activitySessions).toBeGreaterThan(0);
    expect(JSON.stringify({ handoffResource, contextResource, statusResource })).not.toContain(
      "RAW_EVENT_TEXT"
    );

    const program = buildProgram();
    const agentHelp = program.commands.find((command) => command.name() === "agent")?.helpInformation();
    expect(agentHelp).toContain("resources");
    expect(agentHelp).toContain("read");
  });

  it("ingests sanitized Codex sessions from an explicit path", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-codex-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const result = await ingestCodex(createCodexImportDirectory("orbit-cli-codex-test-data-"));
    expect(result.inserted).toBe(5);
    expect(result.pipeline.activitySessions.total).toBeGreaterThan(0);

    const status = getStatus();
    expect(status.counts.sources).toBe(1);
    expect(status.counts.events).toBe(5);
    expect(status.counts.knowledgeArtifacts).toBeGreaterThan(0);
  });

  it("ingests explicit Codex and generic local agent imports", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-realistic-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const codexPath = createCodexImportDirectory("orbit-cli-realistic-codex-");
    const localAgentPath = createLocalAgentImportDirectory("orbit-cli-realistic-agent-");
    const codex = await ingestCodex(codexPath);
    expect(codex.inserted).toBe(5);
    expect(codex.warnings).toHaveLength(1);

    const localAgent = await ingestLocalAgent(localAgentPath);
    expect(localAgent.inserted).toBe(5);
    expect(localAgent.warnings).toHaveLength(1);

    const secondCodex = await ingestCodex(codexPath);
    const secondLocalAgent = await ingestLocalAgent(localAgentPath);
    expect(secondCodex.inserted).toBe(0);
    expect(secondLocalAgent.inserted).toBe(0);

    const status = getStatus();
    expect(status.counts.sources).toBe(2);
    expect(status.counts.events).toBe(10);
  });

  it("reports observation permissions and protected app controls", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-observe-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const initialStatus = getObserveStatus();
    expect(initialStatus.observation.status).toBe("not_configured");
    expect(initialStatus.observation.queueDepth).toBe(0);

    const database = openOrbitDatabase({ orbitHome });
    try {
      const settings = new SettingsRepository(database.db);
      settings.set("observation.accessibility.enabled", true);
      settings.set("observation.permission.accessibility", "denied");
    } finally {
      database.close();
    }

    const permissionNeeded = getObserveStatus();
    expect(permissionNeeded.observation.tiers.tier2.status).toBe("needs_permission");
    expect(getObservePermissions().permissions).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "accessibility", status: "denied" })])
    );

    const status = getObserveStatus();
    expect(status.observation.status).toBe("needs_permission");
    expect(status.observation.tiers.tier2.enabled).toBe(true);
    expect(status.observation.tiers.tier2.status).toBe("needs_permission");
    expect(status.observation.protectedApps.length).toBeGreaterThan(0);
    expect(getObserveProtectedApps().protectedApps.length).toBeGreaterThan(0);
    const userProtected = upsertObserveProtectedRule({
      kind: "domain_pattern",
      value: "private.example.com",
      reason: "user_added"
    });
    expect(userProtected.protectedApps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          match: { kind: "domain_pattern", value: "private.example.com" },
          reason: "user_added",
          enabled: true
        })
      ])
    );
    expect(listActivitySessions()).toHaveLength(0);

    const program = buildProgram();
    const observeHelp = program.commands
      .find((command) => command.name() === "observe")
      ?.helpInformation();
    expect(observeHelp).toContain("status");
    expect(observeHelp).toContain("permissions");
    expect(observeHelp).toContain("protected-apps");
    expect(observeHelp).toContain("protect");
    expect(observeHelp).not.toContain("ingest-mock");
  });

  it("reports Goal 8A perception control-plane status without capture", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-perception-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const status = getPerceptionStatus();
    expect(status.perception.status).toBe("disabled");
    expect(status.perception.sources.map((source) => source.sourceKind)).toEqual([
      "screen",
      "ocr",
      "vision",
      "microphone_audio",
      "system_audio",
      "transcript"
    ]);
    expect(status.perception.sources.every((source) => source.enabled === false)).toBe(true);
    expect(status.perception.resourcePolicy.provider.allowExternalByDefault).toBe(false);
    expect(status.perception.resourcePolicy.queue.dropRawPayloadsFirst).toBe(true);
    expect(status.perception.samplingPreset.name).toBe("conservative");
    expect(status.perception.samplingPolicy.framesPerBurst).toBe(3);
    expect(status.perception.samplingPolicy.minimumBurstIntervalSeconds).toBe(120);
    expect(status.perception.policySnapshot.id).toContain("perception_policy_");
    expect(status.perception.providerRoutes.map((route) => route.task)).toEqual([
      "ocr",
      "vision",
      "transcription"
    ]);

    const protectedRule = setPerceptionProtectedRule({
      kind: "window_title_pattern",
      value: "Customer OTP",
      reason: "user_added"
    });
    expect(protectedRule.perception.protectedApps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          match: { kind: "window_title_pattern", value: "Customer OTP" },
          reason: "user_added"
        })
      ])
    );
    const ignored = ignoreCurrentPerceptionContext({
      appName: "Preview",
      bundleId: "com.apple.Preview",
      windowTitle: "Private contract"
    });
    expect(ignored.perception.protectedApps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          match: { kind: "bundle_id", value: "com.apple.Preview" },
          reason: "user_added"
        }),
        expect.objectContaining({
          match: { kind: "window_title_pattern", value: "^Private contract$" },
          reason: "user_added"
        })
      ])
    );

    const program = buildProgram();
    const perceptionHelp = program.commands
      .find((command) => command.name() === "perception")
      ?.helpInformation();
    expect(perceptionHelp).toContain("status");
    expect(perceptionHelp).toContain("screen");
    expect(perceptionHelp).toContain("sampling-preset");
    expect(perceptionHelp).toContain("protected-rule");
    expect(perceptionHelp).toContain("ignore-current");
  });

  it("updates Screen/OCR sampling presets without starting capture", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-perception-sampling-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const updated = setPerceptionSamplingPreset({ preset: "balanced" });
    expect(updated.perception.status).toBe("disabled");
    expect(updated.perception.samplingPreset.name).toBe("balanced");
    expect(updated.perception.samplingPolicy.framesPerBurst).toBe(4);
    expect(getPerceptionStatus().perception.samplingPreset.name).toBe("balanced");
  });

  it("supports the Screen/OCR-first nested screen cleanup command without starting capture", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-perception-screen-cleanup-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const cleanup = cleanupPerceptionRawSidecars({ dryRun: true });
    expect(cleanup.cleanup.dryRun).toBe(true);
    expect(cleanup.cleanup.cleanedEvents).toBe(0);
    expect(() => cleanupPerceptionRawSidecars()).toThrow(/--confirm/);

    const program = buildProgram();
    const perceptionCommand = program.commands.find((command) => command.name() === "perception");
    const screenCommand = perceptionCommand?.commands.find((command) => command.name() === "screen");
    expect(screenCommand?.helpInformation()).toContain("cleanup");
  });

  it("requires explicit flags for destructive perception cleanup and event deletion", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-perception-delete-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;
    await captureScreenOcrBurstNow({ mock: true });

    const preview = deletePerceptionEvents({
      sourceKind: "screen",
      from: "2026-05-21T00:00:00.000Z",
      to: "2026-05-22T00:00:00.000Z",
      dryRun: true
    });
    expect(preview.deletion.dryRun).toBe(true);
    expect(preview.deletion.matchedEvents).toBeGreaterThan(0);
    expect(() =>
      deletePerceptionEvents({
        sourceKind: "screen",
        from: "2026-05-21T00:00:00.000Z",
        to: "2026-05-22T00:00:00.000Z"
      })
    ).toThrow(/--confirm/);
    expect(() => disablePerceptionSourceAndDeleteRaw({ sourceKind: "screen" })).toThrow(
      /--confirm/
    );

    const disabled = disablePerceptionSourceAndDeleteRaw({
      sourceKind: "screen",
      confirm: true
    });
    expect(disabled.cleanup.dryRun).toBe(false);
    expect(disabled.perception.sources.find((source) => source.sourceKind === "screen")?.enabled)
      .toBe(false);

    const deleted = deletePerceptionEvents({
      sourceKind: "screen",
      from: "2026-05-21T00:00:00.000Z",
      to: "2026-05-22T00:00:00.000Z",
      confirm: true
    });
    expect(deleted.deletion.deletedEvents).toBeGreaterThan(0);
    expect(deleted.deletion.rebuild.status).toBe("completed");

    const program = buildProgram();
    const perceptionHelp = program.commands
      .find((command) => command.name() === "perception")
      ?.helpInformation();
    expect(perceptionHelp).toContain("delete-events");
    expect(perceptionHelp).toContain("disable-source-delete-raw");
  });

  it("runs one mock Screen/OCR capture burst from the nested screen command", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-perception-capture-now-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const result = await captureScreenOcrBurstNow({ mock: true });

    expect(result.mode).toBe("manual_mock_screen_burst");
    expect(result.burst.status).toBe("completed");
    expect(result.burst.frames).toHaveLength(3);
    expect(result.burst.rawStored).toBe(true);
    expect(result.burst.auditOperations).toEqual([
      "perception.burst_scheduled",
      "perception.burst_started",
      "perception.frame_captured",
      "perception.frame_captured",
      "perception.frame_captured",
      "perception.burst_completed"
    ]);
    expect(result.sources.find((source) => source.adapterId === "perception_screen")?.inserted).toBe(
      3
    );
    expect(result.totals.inserted).toBeGreaterThanOrEqual(3);
    expect(result.pipeline.knowledgeArtifacts.generated).toBe(1);

    const session = listActivitySessions()[0]!;
    expect(session.localState.closed).toBe(true);
    expect(session.localState.closeReason).toBe("explicit_boundary");
    expect(session.localState.rawAvailable).toBe(true);
    expect(session.localState.qualitySignals).toMatchObject({
      frameCount: 3,
      isLowQuality: false
    });

    const sidecarRoot = join(orbitHome, "perception-sidecars");
    expect(existsSync(sidecarRoot)).toBe(true);
    expect(readdirSync(sidecarRoot)).toHaveLength(3);

    const artifact = listKnowledgeArtifacts()[0]!;
    expect(artifact.metadata.language).toBe("zh-CN");
    expect(artifact.title).toContain("知识：");
    expect(artifact.content.markdown).toContain("## 关键洞察");
    expect(listRecommendations().some((item) => item.type === "context_needed")).toBe(true);

    const today = getTodayContext("2026-05-21");
    expect(today.activitySessions).toHaveLength(1);
    expect(today.knowledgeArtifacts).toHaveLength(1);
    expect(today.knowledgeArtifacts[0]?.metadata.language).toBe("zh-CN");
    expect(today.recommendations.length).toBeGreaterThan(0);

    const handoff = getTodayHandoff({ date: "2026-05-21" });
    expect(handoff.excluded.map((item) => item.reason)).toEqual(
      expect.arrayContaining(["source_export_blocked", "draft_knowledge"])
    );
    expect(JSON.stringify(handoff)).not.toContain("raw screenshot");
    expect(JSON.stringify(handoff)).not.toContain("raw OCR");

    const audit = getPerceptionReleaseGate().releaseGate.auditReview;
    expect(audit.operationCounts["perception.burst_scheduled"]).toBe(1);
    expect(audit.requiredGroups).toContain("burst_scheduler");
    expect(audit.missingGroups).not.toContain("burst_scheduler");

    const program = buildProgram();
    const perceptionCommand = program.commands.find((command) => command.name() === "perception");
    const screenCommand = perceptionCommand?.commands.find((command) => command.name() === "screen");
    expect(screenCommand?.helpInformation()).toContain("capture-now");
  });

  it("returns Activity playback frames linked to screen/OCR event stream", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-activity-frames-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    await captureScreenOcrBurstNow({ mock: true });
    const session = listActivitySessions()[0]!;
    const frames = getActivityFrames(session.id);
    const playback = getActivityPlayback(session.id);

    expect(frames.activityId).toBe(session.id);
    expect(frames.frameCount).toBe(3);
    expect(frames.eventCount).toBe(7);
    expect(frames.frames[0]).toMatchObject({
      frameIndex: 0,
      rawAvailable: true,
      rawState: "available",
      ocrStatus: "completed"
    });
    expect(frames.frames[0]?.localRef).toContain("perception-sidecars");
    expect(frames.frames[0]?.retention).toMatchObject({
      policyId: "perception_raw_ttl_72h",
      cleanupState: "retained",
      protectionStatus: "allowed"
    });
    expect(frames.frames[0]?.linkedEvents.map((event) => event.type)).toEqual([
      "screen_observation",
      "ocr_text"
    ]);
    expect(playback.scrubber.markers).toHaveLength(3);
    expect(playback.eventStream).toHaveLength(7);
    expect(playback.eventStream.at(-1)?.type).toBe("observation_state");

    const program = buildProgram();
    const activityHelp = program.commands
      .find((command) => command.name() === "activity")
      ?.helpInformation();
    expect(activityHelp).toContain("frames");
    expect(activityHelp).toContain("playback");
  });

  it("reports Goal 9A AI provider runtime routing without running capture", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-ai-status-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const status = getAIStatus();
    expect(status.providerRegistry.tasks.map((task) => task.task)).toEqual([
      "activity_overview_summary",
      "knowledge_draft",
      "vision_summary",
      "ocr_postprocess",
      "transcription",
      "memory_candidate",
      "recommendation",
      "embedding",
      "redaction",
      "context_compression"
    ]);
    expect(status.providerRegistry.summary.disabled).toBe(10);

    process.env.ORBIT_AI_PROVIDER = "mock";
    const mockTest = await testAITask("knowledge_draft");
    expect(mockTest.ok).toBe(true);
    expect(mockTest.provider).toBe("mock");
    expect(mockTest.message).toContain("Mock provider");

    const database = openOrbitDatabase({ orbitHome });
    try {
      updatePerceptionProviderRoute(database.db, "vision", "mock");
    } finally {
      database.close();
    }
    const blocked = getAIStatus();
    expect(
      blocked.providerRegistry.tasks.find((task) => task.task === "vision_summary")?.state
    ).toBe("skipped_by_policy");

    const program = buildProgram();
    const aiHelp = program.commands.find((command) => command.name() === "ai")?.helpInformation();
    expect(aiHelp).toContain("status");
    expect(aiHelp).toContain("test");
  });

  it("runs baseline status smokes sequentially against a fresh Orbit home", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-baseline-smoke-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const status = getStatus();
    const aiStatus = getAIStatus();
    const perceptionStatus = getPerceptionStatus();

    expect(status.orbitHome).toBe(orbitHome);
    expect(aiStatus.orbitHome).toBe(orbitHome);
    expect(perceptionStatus.orbitHome).toBe(orbitHome);
    expect(status.counts.sources).toBe(0);
    expect(aiStatus.providerRegistry.summary.disabled).toBeGreaterThan(0);
    expect(perceptionStatus.perception.status).toBe("disabled");
  });

  it("registers pipeline language control for Chinese Knowledge drafts", () => {
    const program = buildProgram();
    const pipelineCommand = program.commands.find((command) => command.name() === "pipeline");
    const runHelp = pipelineCommand?.commands
      .find((command) => command.name() === "run")
      ?.helpInformation();
    const qualityHelp = pipelineCommand?.commands
      .find((command) => command.name() === "quality")
      ?.helpInformation();
    expect(runHelp).toContain("--language <language>");
    expect(runHelp).toContain("zh-CN");
    expect(qualityHelp).toContain("--language <language>");
    expect(qualityHelp).toContain("evidence-backed quality gate");
  });

  it("turns a manual live screen/OCR capture into Activity, Knowledge, and Memory review state", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-live-screen-ocr-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const result = await captureScreenOcrOnce({
      helper: {
        async captureOnce() {
          return {
            frame: {
              id: "manual_frame_1",
              capturedAt: "2026-05-22T01:02:03.000Z",
              runtimeSessionId: "manual-screen-ocr-test",
              sequence: 1,
              scope: {
                kind: "display",
                label: "Main Display",
                displayId: "1"
              },
              app: {
                name: "Cursor",
                bundleId: "com.todesktop.230313mzl4w4u92"
              },
              window: {
                title: "Orbit Screen OCR"
              },
              width: 1440,
              height: 900,
              frameHash: "manual_frame_hash_1",
              rawLocalRef: "file:///tmp/raw-screen.png",
              sizeBytes: 123_456
            },
            permission: screenPermission("granted"),
            ocr: {
              text: "Orbit real screen OCR 支持中文 password=hunter2",
              confidence: 0.93,
              languages: ["zh-Hans", "en-US"]
            },
            warnings: []
          };
        }
      }
    });

    expect(
      result.sources.find((source) => source.adapterId === "perception_screen")?.inserted
    ).toBe(1);
    expect(result.sources.find((source) => source.adapterId === "perception_ocr")?.inserted).toBe(
      1
    );
    expect(result.pipeline.activitySessions.total).toBe(1);
    expect(result.pipeline.knowledgeArtifacts.generated).toBe(1);
    expect(result.pipeline.knowledgeArtifacts.total).toBe(1);
    expect(JSON.stringify(listActivitySessions())).toContain("Orbit real screen OCR");
    expect(JSON.stringify(listActivitySessions())).not.toContain("raw-screen.png");
    expect(JSON.stringify(listActivitySessions())).not.toContain("hunter2");
    const artifacts = listKnowledgeArtifacts();
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.status).toBe("draft");
    const review = runKnowledgeReviewAction(artifacts[0]!.id, "confirm");
    expect(review.generatedMemories.length).toBeGreaterThan(0);
    runMemoryReviewAction(review.generatedMemories[0]!.id, "confirm");
    expect(listMemories().length).toBeGreaterThan(0);

    const blockedHandoff = getTodayHandoff({ date: "2026-05-22" });
    expect(blockedHandoff.recentActivity).toHaveLength(0);
    expect(blockedHandoff.confirmedKnowledge).toHaveLength(0);
    expect(blockedHandoff.excluded.map((item) => item.reason)).toContain("source_export_blocked");

    const database = openOrbitDatabase({ orbitHome });
    try {
      updatePerceptionSourcePolicy(database.db, "screen", { canExportToAgent: true });
      updatePerceptionSourcePolicy(database.db, "ocr", { canExportToAgent: true });
    } finally {
      database.close();
    }
    const exportableHandoff = getTodayHandoff({ date: "2026-05-22" });
    expect(exportableHandoff.recentActivity).toHaveLength(1);
    expect(exportableHandoff.confirmedKnowledge).toHaveLength(1);
    expect(exportableHandoff.activeMemories).toHaveLength(1);

    const program = buildProgram();
    const perceptionHelp = program.commands
      .find((command) => command.name() === "perception")
      ?.helpInformation();
    expect(perceptionHelp).toContain("capture-screen-ocr");
  });

  it("explains when dogfood readiness is requested for a date without local activity", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-dogfood-date-gap-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    await ingestCodex(createCodexImportDirectory("orbit-cli-dogfood-date-gap-codex-", "2026-05-21"));

    const readiness = getDogfoodReadiness({ date: "2026-05-22" });
    expect(readiness.loop.activity.generated).toBe(false);
    expect(readiness.localDataCoverage).toEqual({
      hasAnyActivity: true,
      latestActivityDate: "2026-05-21",
      requestedDateHasActivity: false,
      explanation:
        "No Activity Sessions exist for 2026-05-22. Latest local Activity is on 2026-05-21; run dogfood for that date or ingest today's authorized sources."
    });
    expect(readiness.nextActions).toEqual(
      expect.arrayContaining(["capture_or_ingest_source", "review_latest_activity_date"])
    );
  });

  it("evaluates Goal 8F perception cleanup and release gates without starting capture", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-perception-gate-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const cleanup = cleanupPerceptionRawSidecars({ dryRun: true });
    expect(cleanup.cleanup.dryRun).toBe(true);
    expect(cleanup.cleanup.cleanedEvents).toBe(0);
    expect(cleanup.cleanup.ledgerPath).toContain("cleanup-ledger.jsonl");

    const gate = getPerceptionReleaseGate();
    expect(gate.releaseGate.status).toBe("pass");
    expect(gate.releaseGate.manualSmoke.missing).toContain("screenRecordingPermission");
    expect(gate.releaseGate.auditReview).toEqual(
      expect.objectContaining({
        operationCounts: expect.any(Object),
        requiredGroups: expect.any(Array),
        missingGroups: expect.any(Array)
      })
    );
    expect(gate.releaseGate.packaging).toEqual(
      expect.objectContaining({
        privateDataScan: expect.objectContaining({
          scanned: expect.any(Number),
          violations: []
        })
      })
    );
    expect(gate.releaseGate.checks.find((check) => check.id === "no_default_capture")?.status).toBe(
      "pass"
    );
    expect(gate.releaseGate.checks.find((check) => check.id === "sidecar_cleanup")?.status).toBe(
      "pass"
    );
    const program = buildProgram();
    const perceptionHelp = program.commands
      .find((command) => command.name() === "perception")
      ?.helpInformation();
    expect(perceptionHelp).toContain("audit-review");
  });

  it("accepts environment-recorded Alpha manual smoke statuses in the release gate", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-manual-smoke-gate-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;
    process.env.ORBIT_ALPHA_MANUAL_SMOKE =
      "screenRecordingPermission=passed,autoStart=passed,pauseResumeStop=passed,playbackEvidence=passed,permissionRevoke=passed,restartAutoResume=passed,resourcePause=passed,protectedContext=passed,auditReview=passed,cleanup=passed,handoffExclusion=passed";

    const gate = getPerceptionReleaseGate();
    expect(gate.releaseGate.manualSmoke.missing).toEqual([]);
    expect(gate.releaseGate.manualSmoke.required).toContain("playbackEvidence");
    expect(gate.releaseGate.checks.find((check) => check.id === "manual_smoke")?.status).toBe(
      "pass"
    );
    expect(gate.releaseGate.nextActions.map((action) => action.id)).not.toContain(
      "manual_smoke.record_evidence"
    );
  });

  it("fails release gate when environment-recorded manual smoke includes a failed required check", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-manual-smoke-failed-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;
    process.env.ORBIT_ALPHA_MANUAL_SMOKE =
      "screenRecordingPermission=passed,autoStart=passed,pauseResumeStop=passed,playbackEvidence=passed,permissionRevoke=passed,restartAutoResume=passed,resourcePause=passed,protectedContext=failed,auditReview=passed,cleanup=passed,handoffExclusion=passed";

    const gate = getPerceptionReleaseGate();
    expect(gate.releaseGate.status).toBe("fail");
    expect(gate.releaseGate.manualSmoke.failed).toEqual(["protectedContext"]);
    expect(gate.releaseGate.nextActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "manual_smoke.rerun_failed",
          command: expect.stringContaining("ORBIT_ALPHA_MANUAL_SMOKE")
        })
      ])
    );
  });

  it("scans packaged desktop output from the repo root even when CLI cwd is a workspace package", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-package-scan-test-"));
    const originalCwd = process.cwd();
    const releaseRoot = join(originalCwd, "apps/desktop/release/test-scan");
    const releaseFile = join(releaseRoot, "Contents/Resources/package-smoke-marker.txt");
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;
    mkdirSync(join(releaseFile, ".."), { recursive: true });
    writeFileSync(releaseFile, "packaged smoke marker");

    process.chdir(join(originalCwd, "apps/cli"));
    try {
      const gate = getPerceptionReleaseGate();
      expect(gate.releaseGate.packaging.privateDataScan.scanned).toBeGreaterThan(0);
      expect(gate.releaseGate.packaging.privateDataScan.violations).toEqual([]);
    } finally {
      process.chdir(originalCwd);
      rmSync(releaseRoot, { recursive: true, force: true });
    }
  });

  it("syncs Alpha dogfood Screen Recording permission without starting capture", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-dogfood-permission-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const granted = syncPerceptionDogfoodPermission({ permission: "granted" });
    expect(granted.perception.dogfoodRuntime).toMatchObject({
      state: "stopped",
      permission: "granted",
      nextAction: "resume_or_enable_observation"
    });

    const status = getPerceptionStatus();
    expect(status.perception.dogfoodRuntime).toMatchObject({
      state: "stopped",
      reason: "user_stopped"
    });
    expect(status.perception.dogfoodRuntime.hardening).toMatchObject({
      cases: expect.arrayContaining([
        expect.objectContaining({
          kind: "helper_missing",
          status: "covered",
          nextAction: "repair_native_helper"
        }),
        expect.objectContaining({
          kind: "sqlite_lock",
          status: "covered",
          nextAction: "repair_local_database"
        }),
        expect.objectContaining({
          kind: "storage_cap_reached",
          status: "covered",
          nextAction: "run_cleanup_or_increase_storage_budget"
        })
      ])
    });

    const gate = getPerceptionReleaseGate();
    expect(gate.releaseGate.runtimeHardening.cases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "helper_timeout", status: "covered" }),
        expect.objectContaining({ kind: "native_abi_mismatch", status: "covered" })
      ])
    );
    expect(gate.releaseGate.checks.find((check) => check.id === "source_install_runtime_hardening")).toMatchObject({
      status: "pass"
    });

    const program = buildProgram();
    const perceptionHelp = program.commands
      .find((command) => command.name() === "perception")
      ?.helpInformation();
    expect(perceptionHelp).toContain("dogfood-permission");
  });
});
