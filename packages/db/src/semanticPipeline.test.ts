import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AIProvider } from "@orbit/ai";
import type { Event } from "@orbit/core";
import { createStableId, hashObject } from "@orbit/core";
import { openOrbitDatabase } from "./connection";
import { EventRepository } from "./repositories/eventRepository";
import { KnowledgeRepository } from "./repositories/knowledgeRepository";
import { runSemanticPipelineWithProvider } from "./semanticPipeline";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("semantic pipeline AI provider integration", () => {
  it("uses provider drafts and filters unknown evidence IDs", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-provider-pipeline-test-"));
    tempDirs.push(orbitHome);
    const database = openOrbitDatabase({ orbitHome });
    try {
      const events = [makeEvent("1", "message"), makeEvent("2", "todo")];
      const eventRepository = new EventRepository(database.db);
      for (const event of events) {
        eventRepository.upsertEvent(event);
      }

      await runSemanticPipelineWithProvider(database, {
        aiProvider: makeProvider({
          keyInsights: [
            { text: "Provider insight", evidenceIds: [events[0]!.id] },
            { text: "Invented insight", evidenceIds: ["missing_event"] }
          ],
          followUps: [
            { title: "Provider follow-up", evidenceIds: [events[1]!.id] },
            { title: "Invented follow-up", evidenceIds: ["missing_event"] }
          ]
        })
      });

      const artifact = new KnowledgeRepository(database.db).listKnowledgeArtifacts()[0]!;
      expect(artifact.metadata.generatedBy).toBe("provider_test");
      expect(artifact.content.keyInsights).toEqual(["Provider insight"]);
      expect(artifact.content.followUps?.map((item) => item.title)).toEqual([
        "Provider follow-up"
      ]);
      expect(artifact.evidence.map((ref) => ref.eventId).sort()).toEqual(
        events.map((event) => event.id).sort()
      );
    } finally {
      database.close();
    }
  });

  it("falls back to deterministic knowledge when the provider fails", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-provider-fallback-test-"));
    tempDirs.push(orbitHome);
    const database = openOrbitDatabase({ orbitHome });
    try {
      new EventRepository(database.db).upsertEvent(makeEvent("1", "message"));

      await runSemanticPipelineWithProvider(database, {
        aiProvider: {
          id: "provider_failure",
          kind: "openai-compatible",
          enabled: true,
          name: "provider_failure",
          async draftKnowledge() {
            throw new Error("provider unavailable");
          }
        }
      });

      const artifact = new KnowledgeRepository(database.db).listKnowledgeArtifacts()[0]!;
      expect(artifact.metadata.generatedBy).toBe("deterministic_fallback");
      expect(artifact.title).toContain("Knowledge:");
    } finally {
      database.close();
    }
  });

  it("does not overwrite reviewed Knowledge when re-running with a provider", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-provider-review-test-"));
    tempDirs.push(orbitHome);
    const database = openOrbitDatabase({ orbitHome });
    try {
      new EventRepository(database.db).upsertEvent(makeEvent("1", "message"));
      await runSemanticPipelineWithProvider(database, {
        aiProvider: makeProvider({
          title: "First provider title"
        })
      });

      const knowledgeRepository = new KnowledgeRepository(database.db);
      const artifact = knowledgeRepository.listKnowledgeArtifacts()[0]!;
      knowledgeRepository.upsertKnowledgeArtifact({
        ...artifact,
        title: "Reviewed title",
        status: "confirmed"
      });

      await runSemanticPipelineWithProvider(database, {
        aiProvider: makeProvider({
          title: "Second provider title"
        })
      });

      expect(knowledgeRepository.getKnowledgeArtifact(artifact.id)?.title).toBe("Reviewed title");
      expect(knowledgeRepository.getKnowledgeArtifact(artifact.id)?.status).toBe("confirmed");
    } finally {
      database.close();
    }
  });
});

function makeProvider(
  output: Partial<Awaited<ReturnType<AIProvider["draftKnowledge"]>>>
): AIProvider {
  return {
    id: "provider_test",
    kind: "mock",
    enabled: true,
    name: "provider_test",
    async draftKnowledge({ events }) {
      return {
        title: output.title ?? "Provider knowledge",
        description: output.description ?? "Provider generated description.",
        keyInsights: output.keyInsights ?? [
          { text: "Provider insight", evidenceIds: [events[0]!.id] }
        ],
        decisions: output.decisions ?? [],
        blockers: output.blockers ?? [],
        followUps: output.followUps ?? [],
        confidence: output.confidence ?? 0.9
      };
    }
  };
}

function makeEvent(id: string, type: Event["type"]): Event {
  const source = {
    kind: "codex" as const,
    adapterId: "fixture_codex",
    externalId: id,
    pointer: `fixture://codex/provider#${id}`
  };
  const input = {
    source,
    occurredAt: `2026-05-20T09:0${id}:00.000Z`,
    type,
    title: type === "todo" ? "Follow up provider" : "Build provider"
  };
  return {
    id: createStableId("event", input),
    schemaVersion: 1,
    source,
    occurredAt: input.occurredAt,
    observedAt: input.occurredAt,
    context: {
      app: "Codex",
      project: "orbit"
    },
    type,
    content: {
      title: input.title
    },
    privacy: {
      sensitivity: "internal",
      retentionPolicyId: "default",
      redactionState: "none"
    },
    hash: hashObject(input)
  };
}
