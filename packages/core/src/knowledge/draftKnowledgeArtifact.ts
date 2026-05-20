import type { ActivitySession, Event, KnowledgeArtifact } from "../index";
import { createStableId } from "../id";

export interface KnowledgeDraftInput {
  session: ActivitySession;
  events: Event[];
  generatedBy?: string;
}

export function draftKnowledgeArtifact(input: KnowledgeDraftInput): KnowledgeArtifact {
  const { session, events } = input;
  const title = `Knowledge: ${session.title}`;
  const keyInsights = buildKeyInsights(events);
  const followUps = events
    .filter((event) => event.type === "todo")
    .map((event) => ({
      id: createStableId("followup", { eventId: event.id }),
      title: event.content.title ?? event.content.text ?? "Follow up",
      status: "open" as const,
      evidence: session.evidence.filter((ref) => ref.eventId === event.id)
    }));
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
      generatedBy: input.generatedBy ?? "mock_provider",
      language: "en"
    },
    content: {
      description: session.summary ?? "Synthetic activity summary generated from source events.",
      keyInsights,
      followUps,
      markdown
    },
    evidence: session.evidence,
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
