import type { KnowledgeArtifact, Memory } from "../index";
import { createStableId } from "../id";

export function extractMemoryCandidates(artifacts: KnowledgeArtifact[]): Memory[] {
  return artifacts.flatMap((artifact) =>
    artifact.content.keyInsights.slice(0, 2).map((insight, index) => {
      const scope: Memory["scope"] = {
        sourceKinds: Array.from(new Set(artifact.evidence.map((ref) => ref.sourceKind)))
      };
      const project = artifact.metadata.projects[0];
      if (project) {
        scope.project = project;
      } else {
        scope.global = true;
      }

      return {
        id: createStableId("memory", { artifactId: artifact.id, insight, index }),
        schemaVersion: 1,
        kind: "project_fact" as const,
        title: `Memory candidate: ${artifact.title}`,
        body: insight,
        status: "needs_review" as const,
        scope,
        tags: ["candidate", artifact.type],
        evidence: artifact.evidence,
        confidence: Math.min(0.7, artifact.confidence),
        createdAt: artifact.updatedAt,
        updatedAt: artifact.updatedAt
      };
    })
  );
}
