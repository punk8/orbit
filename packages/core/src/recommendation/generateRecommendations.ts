import type { ActivitySession, Event, KnowledgeArtifact, Memory, Recommendation } from "../index";
import { createStableId } from "../id";

export interface GenerateRecommendationInput {
  events: Event[];
  sessions: ActivitySession[];
  artifacts: KnowledgeArtifact[];
  memories: Memory[];
}

export function generateRecommendations(input: GenerateRecommendationInput): Recommendation[] {
  const followUps = input.events
    .filter((event) => event.type === "todo")
    .map((event) => {
      const evidence = {
        eventId: event.id,
        sourceKind: event.source.kind,
        sourcePointer: event.source.pointer,
        timestamp: event.occurredAt
      };
      const excerpt = event.content.title ?? event.content.text;

      return {
        id: createStableId("recommendation", { type: "follow_up", eventId: event.id }),
        schemaVersion: 1,
        type: "follow_up" as const,
        title: event.content.title ?? "Follow up detected",
        explanation: "A source event was normalized as a follow-up item.",
        suggestedAction: "Review the source context and decide whether to create a task draft.",
        confidence: event.classification?.confidence ?? 0.75,
        impact: "medium" as const,
        status: "new" as const,
        evidence: excerpt ? [{ ...evidence, excerpt }] : [evidence],
        createdAt: event.observedAt
      };
    });

  const contextRecommendation =
    input.sessions.length > 0 && input.artifacts.length > 0
      ? [
          {
            id: createStableId("recommendation", {
              type: "context_needed",
              sessions: input.sessions.map((session) => session.id)
            }),
            schemaVersion: 1,
            type: "context_needed" as const,
            title: "Review generated knowledge before relying on memory",
            explanation:
              "Knowledge drafts exist but memory candidates remain in review, so agent context should cite source-backed artifacts.",
            suggestedAction: "Open the review queue and confirm only stable memory candidates.",
            confidence: 0.72,
            impact: "medium" as const,
            status: "new" as const,
            evidence: input.artifacts.flatMap((artifact) => artifact.evidence).slice(0, 5),
            createdAt: input.artifacts[0]?.createdAt ?? new Date().toISOString()
          }
        ]
      : [];

  return [...followUps, ...contextRecommendation];
}
