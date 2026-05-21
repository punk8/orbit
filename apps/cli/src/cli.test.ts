import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { buildProgram } from "./index";
import { ingestCodex } from "./commands/ingestCodex";
import { ingestFixtures } from "./commands/ingestFixtures";
import { ingestLocalAgent } from "./commands/ingestLocalAgent";
import { ingestPerceptionFixtures } from "./commands/ingestPerceptionFixtures";
import { runKnowledgeReviewAction, runMemoryReviewAction } from "./commands/governanceActions";
import { getTodayHandoff, getTodayHandoffMarkdown } from "./commands/handoff";
import {
  getObservePermissions,
  getObserveProtectedApps,
  getObserveStatus,
  ingestMockDesktopObservations
} from "./commands/observe";
import {
  cleanupPerceptionRawSidecars,
  getPerceptionReleaseGate,
  getPerceptionStatus,
  runScreenOcrSmoke
} from "./commands/perception";
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
import { getStatus } from "./commands/status";
import { getAIStatus, testAITask } from "./commands/ai";

const tempDirs: string[] = [];

afterEach(() => {
  delete process.env.ORBIT_HOME;
  delete process.env.ORBIT_AI_PROVIDER;
  delete process.env.ORBIT_OPENAI_BASE_URL;
  delete process.env.ORBIT_OPENAI_MODEL;
  delete process.env.ORBIT_OPENAI_API_KEY;
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("cli commands", () => {
  it("ingests fixtures and reports status", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const first = await ingestFixtures();
    expect(first.totals.inserted).toBe(10);

    const second = await ingestFixtures();
    expect(second.totals.inserted).toBe(0);

    const status = getStatus();
    expect(status.counts.sources).toBe(2);
    expect(status.counts.events).toBe(10);
    expect(status.counts.activitySessions).toBe(5);
    expect(status.counts.knowledgeArtifacts).toBe(5);
    expect(status.counts.memories).toBe(0);
    expect(status.counts.recommendations).toBe(2);

    expect(first.pipeline.activitySessions.total).toBe(5);
    expect(first.pipeline.knowledgeArtifacts.total).toBe(5);
    expect(first.pipeline.memories.total).toBe(0);
    expect(first.pipeline.recommendations.total).toBe(2);

    expect(listActivitySessions()).toHaveLength(5);
    const artifacts = listKnowledgeArtifacts();
    expect(artifacts).toHaveLength(5);
    expect(listMemories()).toHaveLength(0);
    expect(listRecommendations()).toHaveLength(2);
    expect(searchKnowledgeArtifacts("Orbit")).not.toHaveLength(0);
    expect(getTodayContext("2026-05-20").activitySessions).toHaveLength(3);
    expect(getProjectContext("orbit").knowledgeArtifacts).toHaveLength(0);

    const reviewResult = runKnowledgeReviewAction(artifacts[0]!.id, "confirm");
    expect(reviewResult.artifact.status).toBe("confirmed");
    expect(reviewResult.generatedMemories).toHaveLength(2);
    expect(listMemories()).toHaveLength(2);
    expect(searchMemories("Orbit")).not.toHaveLength(0);
    expect(getProjectContext("orbit").knowledgeArtifacts).toHaveLength(1);

    const third = await ingestFixtures();
    expect(third.totals.inserted).toBe(0);
    expect(
      listKnowledgeArtifacts().find((artifact) => artifact.id === artifacts[0]!.id)?.status
    ).toBe("confirmed");
    expect(listMemories()).toHaveLength(2);
  });

  it("generates handoff packs and registers handoff commands", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-handoff-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    await ingestFixtures();
    const artifacts = listKnowledgeArtifacts();
    const review = runKnowledgeReviewAction(artifacts[0]!.id, "confirm");
    runMemoryReviewAction(review.generatedMemories[0]!.id, "confirm");

    const pack = getTodayHandoff({
      date: "2026-05-20",
      generatedAt: "2026-05-21T08:00:00.000Z"
    });
    expect(pack.kind).toBe("today");
    expect(pack.recentActivity.length).toBeGreaterThan(0);
    expect(pack.confirmedKnowledge.length).toBeGreaterThan(0);
    expect(pack.activeMemories.length).toBeGreaterThan(0);
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

  it("ingests sanitized Codex sessions from an explicit path", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-codex-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const result = await ingestCodex(join(process.cwd(), "fixtures/codex-sessions"));
    expect(result.inserted).toBe(3);
    expect(result.pipeline.activitySessions.total).toBe(1);

    const status = getStatus();
    expect(status.counts.sources).toBe(1);
    expect(status.counts.events).toBe(3);
    expect(status.counts.knowledgeArtifacts).toBe(1);
  });

  it("ingests realistic Codex and generic local agent fixtures", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-realistic-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const codex = await ingestCodex(join(process.cwd(), "fixtures/realistic/codex"));
    expect(codex.inserted).toBe(8);
    expect(codex.warnings).toHaveLength(1);

    const localAgent = await ingestLocalAgent(
      join(process.cwd(), "fixtures/realistic/local-agent")
    );
    expect(localAgent.inserted).toBe(8);
    expect(localAgent.warnings).toHaveLength(1);

    const secondCodex = await ingestCodex(join(process.cwd(), "fixtures/realistic/codex"));
    const secondLocalAgent = await ingestLocalAgent(
      join(process.cwd(), "fixtures/realistic/local-agent")
    );
    expect(secondCodex.inserted).toBe(0);
    expect(secondLocalAgent.inserted).toBe(0);

    const status = getStatus();
    expect(status.counts.sources).toBe(2);
    expect(status.counts.events).toBe(16);
  });

  it("ingests mock desktop observations and reports observation status", async () => {
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

    const first = await ingestMockDesktopObservations();
    expect(first.source.inserted).toBe(7);
    expect(first.pipeline.activitySessions.total).toBe(2);
    expect(first.pipeline.knowledgeArtifacts.total).toBe(0);
    expect(first.pipeline.recommendations.total).toBe(0);

    const second = await ingestMockDesktopObservations();
    expect(second.source.inserted).toBe(0);

    const status = getObserveStatus();
    expect(status.observation.status).toBe("ready");
    expect(status.observation.enabled).toBe(true);
    expect(status.observation.tiers.tier1.enabled).toBe(true);
    expect(status.observation.tiers.tier1.status).toBe("ready");
    expect(status.observation.tiers.tier1.sourceKinds).toContain("desktop");
    expect(status.observation.protectedApps.length).toBeGreaterThan(0);
    expect(getObserveProtectedApps().protectedApps.length).toBeGreaterThan(0);
    expect(listActivitySessions()).toHaveLength(2);

    const program = buildProgram();
    const observeHelp = program.commands
      .find((command) => command.name() === "observe")
      ?.helpInformation();
    expect(observeHelp).toContain("status");
    expect(observeHelp).toContain("permissions");
    expect(observeHelp).toContain("protected-apps");
    expect(observeHelp).toContain("ingest-mock");
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
    expect(status.perception.providerRoutes.map((route) => route.task)).toEqual([
      "ocr",
      "vision",
      "transcription"
    ]);

    const program = buildProgram();
    const perceptionHelp = program.commands
      .find((command) => command.name() === "perception")
      ?.helpInformation();
    expect(perceptionHelp).toContain("status");
  });

  it("reports Goal 9A AI provider runtime routing without running capture", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-ai-status-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const status = getAIStatus();
    expect(status.providerRegistry.tasks.map((task) => task.task)).toEqual([
      "knowledge_draft",
      "vision_summary",
      "ocr_postprocess",
      "transcription",
      "memory_candidate",
      "recommendation",
      "context_compression"
    ]);
    expect(status.providerRegistry.summary.disabled).toBe(7);

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

  it("ingests explicit screen/OCR perception fixtures into Activity", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-perception-fixture-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const first = await ingestPerceptionFixtures();
    expect(first.totals.inserted).toBe(4);
    expect(first.sources.flatMap((source) => source.warnings)).toEqual(
      expect.arrayContaining([
        "Suppressed protected screen frame frame_protected_vault.",
        "Suppressed OCR for protected screen frame frame_protected_vault."
      ])
    );
    expect(first.pipeline.activitySessions.total).toBe(1);

    const sessions = listActivitySessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.sourceKinds).toEqual(expect.arrayContaining(["screen", "ocr"]));
    expect(JSON.stringify(sessions)).not.toContain("hunter2");
    expect(JSON.stringify(sessions)).not.toContain("sk-test");

    const second = await ingestPerceptionFixtures();
    expect(second.totals.inserted).toBe(0);
  });

  it("feeds mock vision summaries into Events and Knowledge drafts when policy allows", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-vision-fixture-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const database = openOrbitDatabase({ orbitHome });
    try {
      updatePerceptionSourcePolicy(database.db, "screen", { canUseForAI: true });
      updatePerceptionSourcePolicy(database.db, "vision", { canUseForAI: true });
      updatePerceptionProviderRoute(database.db, "vision", "mock");
    } finally {
      database.close();
    }

    const result = await ingestPerceptionFixtures({ includeVision: true });
    expect(
      result.sources.find((source) => source.adapterId === "perception_vision")?.inserted
    ).toBe(2);
    expect(result.pipeline.activitySessions.total).toBe(1);
    expect(result.pipeline.knowledgeArtifacts.total).toBe(1);

    const artifact = listKnowledgeArtifacts()[0];
    expect(JSON.stringify(artifact)).toContain("Vision summary");
    expect(JSON.stringify(artifact)).not.toContain("hunter2");
    expect(JSON.stringify(artifact)).not.toContain("sk-test");
  });

  it("feeds mock meeting audio transcripts into Activity when policy allows", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-audio-fixture-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const database = openOrbitDatabase({ orbitHome });
    try {
      updatePerceptionSourcePolicy(database.db, "microphone_audio", { canUseForAI: true });
      updatePerceptionSourcePolicy(database.db, "transcript", { canUseForAI: true });
      updatePerceptionProviderRoute(database.db, "transcription", "mock");
    } finally {
      database.close();
    }

    const result = await ingestPerceptionFixtures({ includeAudio: true });
    expect(result.sources.find((source) => source.adapterId === "perception_audio")?.inserted).toBe(
      3
    );
    expect(
      result.sources.find((source) => source.adapterId === "perception_transcript")?.inserted
    ).toBe(2);
    expect(result.sources.flatMap((source) => source.warnings)).toEqual(
      expect.arrayContaining([
        "Suppressed protected audio segment audio_protected_vault.",
        "Suppressed transcript for protected audio segment audio_protected_vault.",
        "Skipped transcript for failed-redaction segment audio_failed_redaction."
      ])
    );
    expect(result.pipeline.activitySessions.total).toBe(2);
    expect(JSON.stringify(listActivitySessions())).toContain("transcript://meeting");
    expect(JSON.stringify(listActivitySessions())).not.toContain("hunter2");
    expect(JSON.stringify(listActivitySessions())).not.toContain("sk-test");
  });

  it("completes Goal 8E perception context with safe summaries and preserved review state", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-perception-context-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const database = openOrbitDatabase({ orbitHome });
    try {
      for (const source of ["screen", "ocr", "vision", "microphone_audio", "transcript"] as const) {
        updatePerceptionSourcePolicy(database.db, source, {
          canUseForAI: true,
          canExportToAgent: true
        });
      }
      updatePerceptionProviderRoute(database.db, "vision", "mock");
      updatePerceptionProviderRoute(database.db, "transcription", "mock");
    } finally {
      database.close();
    }

    const result = await ingestPerceptionFixtures({ includeVision: true, includeAudio: true });
    expect(result.pipeline.activitySessions.total).toBe(2);
    expect(result.pipeline.knowledgeArtifacts.total).toBe(2);

    const sessions = listActivitySessions();
    expect(sessions.flatMap((session) => session.localState.sourcePolicies ?? [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceAdapterId: "perception_screen",
          canExportToAgent: true
        }),
        expect.objectContaining({
          sourceAdapterId: "perception_transcript",
          canExportToAgent: true
        })
      ])
    );
    const today = getTodayContext("2026-05-21");
    expect(today.activitySessions).toHaveLength(2);
    expect(today.knowledgeArtifacts).toHaveLength(2);
    expect(today.recommendations.some((item) => item.type === "follow_up")).toBe(true);
    expect(today.recommendations.some((item) => item.type === "risk")).toBe(true);

    const artifact = listKnowledgeArtifacts()[0]!;
    runKnowledgeReviewAction(artifact.id, "confirm");
    await ingestPerceptionFixtures({ includeVision: true, includeAudio: true });
    expect(listKnowledgeArtifacts().find((item) => item.id === artifact.id)?.status).toBe(
      "confirmed"
    );

    const handoff = getTodayHandoff({ date: "2026-05-21" });
    expect(handoff.recentActivity.length).toBeGreaterThan(0);
    expect(handoff.confirmedKnowledge.length).toBeGreaterThan(0);
    expect(handoff.recommendedNextActions.length).toBeGreaterThan(0);
    expect(JSON.stringify(handoff)).toContain("screen://capture");
    expect(JSON.stringify(handoff)).not.toContain("hunter2");
    expect(JSON.stringify(handoff)).not.toContain("sk-test");
    expect(JSON.stringify(handoff)).not.toContain("person@example.com");
  });

  it("runs a mock screen/OCR start pause resume stop smoke", async () => {
    const smoke = await runScreenOcrSmoke("window");
    expect(smoke.scope.kind).toBe("window");
    expect(smoke.transitions.map((transition) => transition.action)).toEqual([
      "start",
      "capture",
      "pause",
      "resume",
      "stop"
    ]);
    expect(smoke.transitions[0]?.status).toBe("collecting");
    expect(smoke.transitions.at(-1)?.status).toBe("stopped");

    const program = buildProgram();
    const perceptionHelp = program.commands
      .find((command) => command.name() === "perception")
      ?.helpInformation();
    const ingestHelp = program.commands
      .find((command) => command.name() === "ingest")
      ?.helpInformation();
    expect(perceptionHelp).toContain("screen-ocr-smoke");
    expect(perceptionHelp).toContain("source-policy");
    expect(perceptionHelp).toContain("provider-route");
    expect(perceptionHelp).toContain("cleanup");
    expect(perceptionHelp).toContain("release-gate");
    expect(ingestHelp).toContain("perception-fixtures");
  });

  it("evaluates Goal 8F perception cleanup and release gates without starting capture", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-cli-perception-gate-test-"));
    tempDirs.push(orbitHome);
    process.env.ORBIT_HOME = orbitHome;

    const cleanup = cleanupPerceptionRawSidecars({ dryRun: true });
    expect(cleanup.cleanup.dryRun).toBe(true);
    expect(cleanup.cleanup.cleanedEvents).toBe(0);

    const gate = getPerceptionReleaseGate();
    expect(gate.releaseGate.status).toBe("pass");
    expect(gate.releaseGate.checks.find((check) => check.id === "no_default_capture")?.status).toBe(
      "pass"
    );
    expect(gate.releaseGate.checks.find((check) => check.id === "sidecar_cleanup")?.status).toBe(
      "pass"
    );
  });
});
