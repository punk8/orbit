import type { ActivitySession, Event, FollowUp, KnowledgeArtifact, SourceKind } from "../index";
import { createStableId } from "../id";

export interface KnowledgeDraftInput {
  session: ActivitySession;
  events: Event[];
  generatedBy?: string;
}

export function draftKnowledgeArtifact(input: KnowledgeDraftInput): KnowledgeArtifact {
  const { session, events } = input;
  const title = `Knowledge: ${session.title}`;
  const safeEvents = events.filter(isSafeKnowledgeEvent);
  const safeEvidence = evidenceForEvents(session, safeEvents);
  const keyInsights = buildKeyInsights(safeEvents);
  const followUps = buildFollowUps(safeEvents, safeEvidence);
  const evidenceSummary = buildEvidenceSummary(safeEvents);
  const markdown = [
    `# ${title}`,
    "",
    `Time: ${session.startAt} - ${session.endAt}`,
    `Project: ${session.project ?? "unknown"}`,
    "",
    "## Description",
    session.summary ?? "Synthetic activity summary generated from source events.",
    "",
    "## Key Insights",
    ...keyInsights.map((insight) => `- ${insight}`),
    "",
    "## Evidence",
    ...evidenceSummary.map((item) => `- ${item}`),
    "",
    "## Follow Ups",
    ...(followUps.length > 0 ? followUps.map((item) => `- ${item.title}`) : ["- None"])
  ].join("\n");

  const artifact: KnowledgeArtifact = {
    id: createStableId("knowledge", { sessionId: session.id, type: "daily_brief" }),
    schemaVersion: 1,
    type: "daily_brief",
    title,
    status: "draft",
    metadata: {
      timeWindow: {
        startAt: session.startAt,
        endAt: session.endAt
      },
      apps: session.apps,
      projects: session.project ? [session.project] : [],
      sourceSessionIds: [session.id],
      generatedBy: input.generatedBy ?? "deterministic_local",
      language: "en"
    },
    content: {
      description: session.summary ?? "Synthetic activity summary generated from source events.",
      keyInsights,
      followUps,
      markdown
    },
    evidence: safeEvidence,
    confidence: 0.75,
    createdAt: session.updatedAt,
    updatedAt: session.updatedAt
  };

  return artifact;
}

function buildKeyInsights(events: Event[]): string[] {
  const insights = events
    .map((event) => event.content.summary ?? event.content.title ?? event.content.text)
    .filter((value): value is string => Boolean(value))
    .slice(0, 5);
  return insights.length > 0 ? insights : ["No durable insight extracted from this session yet."];
}

function buildFollowUps(events: Event[], evidence: ActivitySession["evidence"]): FollowUp[] {
  return events
    .flatMap((event) => {
      const title = followUpTitle(event);
      if (!title) return [];
      return [
        {
          id: createStableId("followup", { eventId: event.id, title }),
          title,
          status: "open" as const,
          evidence: evidence.filter((ref) => ref.eventId === event.id)
        }
      ];
    })
    .filter((item) => item.evidence.length > 0);
}

function followUpTitle(event: Event): string | undefined {
  if (event.type === "todo") return event.content.title ?? event.content.text ?? "Follow up";
  if (!isPerceptionSource(event.source.kind)) return undefined;
  const text = event.content.summary ?? event.content.text ?? event.content.title ?? "";
  if (!/\b(follow up|action item|next)\b/i.test(text)) return undefined;
  return truncateForKnowledge(text, 160);
}

function buildEvidenceSummary(events: Event[]): string[] {
  const items = events.slice(0, 8).map((event) => {
    const pointer = event.source.pointer;
    const source = event.source.kind;
    const sensitivity = event.privacy.sensitivity;
    const redaction = event.privacy.redactionState;
    return `${source} ${pointer} (${sensitivity}, redaction=${redaction})`;
  });
  return items.length > 0 ? items : ["No source evidence linked."];
}

function evidenceForEvents(session: ActivitySession, events: Event[]): ActivitySession["evidence"] {
  const safeEventIds = new Set(events.map((event) => event.id));
  return session.evidence.filter((ref) => ref.eventId && safeEventIds.has(ref.eventId));
}

function isSafeKnowledgeEvent(event: Event): boolean {
  return event.privacy.sensitivity !== "secret" && event.privacy.redactionState !== "failed";
}

function isPerceptionSource(sourceKind: SourceKind): boolean {
  return (
    sourceKind === "screen" ||
    sourceKind === "ocr" ||
    sourceKind === "audio" ||
    sourceKind === "transcript"
  );
}

function truncateForKnowledge(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
