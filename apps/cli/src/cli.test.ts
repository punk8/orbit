import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { ingestCodex } from "./commands/ingestCodex";
import { ingestFixtures } from "./commands/ingestFixtures";
import { ingestLocalAgent } from "./commands/ingestLocalAgent";
import { runKnowledgeReviewAction } from "./commands/governanceActions";
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

const tempDirs: string[] = [];

afterEach(() => {
  delete process.env.ORBIT_HOME;
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
    expect(getProjectContext("orbit").knowledgeArtifacts).toHaveLength(5);

    const reviewResult = runKnowledgeReviewAction(artifacts[0]!.id, "confirm");
    expect(reviewResult.artifact.status).toBe("confirmed");
    expect(reviewResult.generatedMemories).toHaveLength(2);
    expect(listMemories()).toHaveLength(2);
    expect(searchMemories("Orbit")).not.toHaveLength(0);

    const third = await ingestFixtures();
    expect(third.totals.inserted).toBe(0);
    expect(
      listKnowledgeArtifacts().find((artifact) => artifact.id === artifacts[0]!.id)?.status
    ).toBe("confirmed");
    expect(listMemories()).toHaveLength(2);
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
    expect(codex.inserted).toBe(6);
    expect(codex.warnings).toHaveLength(1);

    const localAgent = await ingestLocalAgent(
      join(process.cwd(), "fixtures/realistic/local-agent")
    );
    expect(localAgent.inserted).toBe(4);
    expect(localAgent.warnings).toHaveLength(0);

    const secondCodex = await ingestCodex(join(process.cwd(), "fixtures/realistic/codex"));
    const secondLocalAgent = await ingestLocalAgent(
      join(process.cwd(), "fixtures/realistic/local-agent")
    );
    expect(secondCodex.inserted).toBe(0);
    expect(secondLocalAgent.inserted).toBe(0);

    const status = getStatus();
    expect(status.counts.sources).toBe(2);
    expect(status.counts.events).toBe(10);
  });
});
