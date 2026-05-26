import type {
  ActivitySession,
  Event,
  EvidenceRef,
  KnowledgeArtifact,
  Memory,
  Recommendation
} from "../index";
import { createStableId } from "../id";
import { isPerceptionSource } from "../perception/perceptionEvidencePacket";

export interface GenerateRecommendationInput {
  events: Event[];
  sessions: ActivitySession[];
  artifacts: KnowledgeArtifact[];
  memories: Memory[];
}

export function generateRecommendations(input: GenerateRecommendationInput): Recommendation[] {
  const safeEvents = input.events.filter(isSafeRecommendationEvent);
  const explicitFollowUps = safeEvents
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
  const perceptionFollowUps = safeEvents
    .filter((event) => isPerceptionSource(event.source.kind))
    .filter((event) => followUpPattern.test(eventText(event)))
    .map((event) =>
      recommendationFromEvent({
        event,
        type: "follow_up",
        title:
          event.source.kind === "transcript"
            ? "Review meeting follow-up from transcript"
            : "Review follow-up visible in perception evidence",
        explanation:
          "Perception evidence contains follow-up language in a redacted summary or transcript segment.",
        suggestedAction:
          "Review the linked Activity evidence and decide whether it belongs in the task list.",
        confidence: Math.max(event.classification?.confidence ?? 0.72, 0.74),
        impact: "medium"
      })
    );
  const visibleRisks = safeEvents
    .filter((event) => isPerceptionSource(event.source.kind))
    .filter((event) => riskPattern.test(eventText(event)))
    .map((event) =>
      recommendationFromEvent({
        event,
        type: "risk",
        title: "Review unresolved issue visible in perception evidence",
        explanation:
          "Screen, OCR, or transcript evidence suggests an unresolved error, bug, blocker, or failure.",
        suggestedAction:
          "Open the source Activity and verify whether the issue still needs follow-up.",
        confidence: Math.max(event.classification?.confidence ?? 0.7, 0.76),
        impact: "high"
      })
    );

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
  const perceptionContextRecommendation = buildPerceptionContextRecommendation(input);

  return dedupeRecommendations([
    ...explicitFollowUps,
    ...perceptionFollowUps,
    ...visibleRisks,
    ...contextRecommendation,
    ...perceptionContextRecommendation
  ]).map((recommendation) => {
    if (!recommendation.evidence.some((ref) => isPerceptionSource(ref.sourceKind))) {
      return recommendation;
    }
    return {
      ...recommendation,
      explanation: `${recommendation.explanation} Handoff should use summary/source pointers only; raw/private perception payloads stay excluded by policy.`
    };
  });
}

export function recommendationDedupeKey(recommendation: Recommendation): string {
  const evidenceScope = recommendation.evidence
    .map((ref) => ref.eventId ?? `${ref.sourceKind}:${ref.sourcePointer}`)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 8)
    .join("|");
  return [
    recommendation.type,
    normalizeRecommendationText(recommendation.title),
    normalizeRecommendationText(recommendation.suggestedAction),
    evidenceScope || normalizeRecommendationText(recommendation.explanation)
  ].join("::");
}

function recommendationFromEvent(input: {
  event: Event;
  type: Recommendation["type"];
  title: string;
  explanation: string;
  suggestedAction: string;
  confidence: number;
  impact: Recommendation["impact"];
}): Recommendation {
  const excerpt = truncate(eventText(input.event), 220);
  const evidence = evidenceFromEvent(input.event, excerpt);
  return {
    id: createStableId("recommendation", {
      type: input.type,
      eventId: input.event.id,
      title: input.title
    }),
    schemaVersion: 1,
    type: input.type,
    title: input.title,
    explanation: input.explanation,
    suggestedAction: input.suggestedAction,
    confidence: clamp(input.confidence),
    impact: input.impact,
    status: "new",
    evidence: [evidence],
    createdAt: input.event.observedAt
  };
}

function buildPerceptionContextRecommendation(
  input: GenerateRecommendationInput
): Recommendation[] {
  const perceptionSessions = input.sessions.filter((session) =>
    session.sourceKinds.some(isPerceptionSource)
  );
  if (perceptionSessions.length === 0) return [];
  const reviewedArtifactIds = new Set(
    input.artifacts
      .filter((artifact) => artifact.status === "confirmed")
      .flatMap((artifact) => artifact.metadata.sourceSessionIds)
  );
  const unreviewedSessions = perceptionSessions.filter(
    (session) => !reviewedArtifactIds.has(session.id)
  );
  if (unreviewedSessions.length === 0) return [];
  const safeEventIds = new Set(
    input.events.filter(isSafeRecommendationEvent).map((event) => event.id)
  );
  const evidence = unreviewedSessions
    .flatMap((session) => session.evidence)
    .filter((ref) => ref.eventId && safeEventIds.has(ref.eventId))
    .slice(0, 6);
  if (evidence.length === 0) return [];
  return [
    {
      id: createStableId("recommendation", {
        type: "context_needed",
        sessions: unreviewedSessions.map((session) => session.id)
      }),
      schemaVersion: 1,
      type: "context_needed",
      title: "Review perception-backed context before relying on it",
      explanation:
        "Perception-derived Activity exists, but its Knowledge drafts still need user review before becoming durable Memory.",
      suggestedAction: "Open Knowledge review and confirm only stable, non-sensitive conclusions.",
      confidence: 0.73,
      impact: "medium",
      status: "new",
      evidence,
      createdAt: unreviewedSessions[0]?.updatedAt ?? new Date().toISOString()
    }
  ];
}

function evidenceFromEvent(event: Event, excerpt: string): EvidenceRef {
  return {
    eventId: event.id,
    sourceKind: event.source.kind,
    sourcePointer: event.source.pointer,
    timestamp: event.occurredAt,
    excerpt
  };
}

function eventText(event: Event): string {
  return [event.content.title, event.content.summary, event.content.text]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function isSafeRecommendationEvent(event: Event): boolean {
  return event.privacy.sensitivity !== "secret" && event.privacy.redactionState !== "failed";
}

function dedupeRecommendations(recommendations: Recommendation[]): Recommendation[] {
  const seen = new Set<string>();
  const result: Recommendation[] = [];
  for (const recommendation of recommendations) {
    if (seen.has(recommendation.id)) continue;
    seen.add(recommendation.id);
    result.push(recommendation);
  }
  return result;
}

function normalizeRecommendationText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function clamp(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

const followUpPattern = /\b(follow up|action item|next)\b|待跟进|后续|下一步|行动项|需要处理/i;
const riskPattern =
  /\b(error|failed|failure|bug|blocked|unresolved|exception)\b|失败|错误|阻塞|风险|异常|未解决/i;
