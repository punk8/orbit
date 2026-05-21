import type {
  HandoffActivityItem,
  HandoffDecisionItem,
  HandoffEvidenceItem,
  HandoffKnowledgeItem,
  HandoffMemoryItem,
  HandoffPack,
  HandoffRecommendationItem,
  HandoffRiskItem,
  HandoffSafetyBoundary
} from "./handoffPack";

export function formatHandoffMarkdown(pack: HandoffPack): string {
  return [
    "# Orbit Handoff",
    "",
    "## Objective",
    pack.objective,
    "",
    "## Current State",
    formatList(pack.currentState),
    "",
    "## Recent Activity",
    formatActivity(pack.recentActivity),
    "",
    "## Confirmed Knowledge",
    formatKnowledge(pack.confirmedKnowledge),
    "",
    "## Active Memories",
    formatMemories(pack.activeMemories),
    "",
    "## Decisions",
    formatDecisions(pack.decisions),
    "",
    "## Blockers And Risks",
    formatRisks(pack.blockersAndRisks),
    "",
    "## Recommended Next Actions",
    formatRecommendations(pack.recommendedNextActions),
    "",
    "## Safety Boundaries",
    formatSafety(pack.safetyBoundaries),
    "",
    "## Evidence Index",
    formatEvidence(pack.evidenceIndex)
  ].join("\n");
}

function formatActivity(items: HandoffActivityItem[]): string {
  if (items.length === 0) return "- None";
  return items
    .map(
      (item) =>
        `- ${item.title} (${item.startAt} - ${item.endAt})${item.summary ? `: ${item.summary}` : ""}`
    )
    .join("\n");
}

function formatKnowledge(items: HandoffKnowledgeItem[]): string {
  if (items.length === 0) return "- None";
  return items
    .map((item) => `- ${item.title}: ${item.description}${formatEvidenceSuffix(item.evidenceIds)}`)
    .join("\n");
}

function formatMemories(items: HandoffMemoryItem[]): string {
  if (items.length === 0) return "- None";
  return items
    .map((item) => `- ${item.title}: ${item.body}${formatEvidenceSuffix(item.evidenceIds)}`)
    .join("\n");
}

function formatDecisions(items: HandoffDecisionItem[]): string {
  if (items.length === 0) return "- None";
  return items
    .map((item) => `- ${item.title}${formatEvidenceSuffix(item.evidenceIds)}`)
    .join("\n");
}

function formatRisks(items: HandoffRiskItem[]): string {
  if (items.length === 0) return "- None";
  return items
    .map((item) => {
      const action = item.suggestedAction ? ` Action: ${item.suggestedAction}` : "";
      return `- ${item.title}${action}${formatEvidenceSuffix(item.evidenceIds)}`;
    })
    .join("\n");
}

function formatRecommendations(items: HandoffRecommendationItem[]): string {
  if (items.length === 0) return "- None";
  return items
    .map(
      (item) =>
        `- ${item.title}: ${item.suggestedAction} (${item.impact}, confidence ${item.confidence})${formatEvidenceSuffix(item.evidenceIds)}`
    )
    .join("\n");
}

function formatSafety(items: HandoffSafetyBoundary[]): string {
  return items.map((item) => `- ${item.title}: ${item.description}`).join("\n");
}

function formatEvidence(items: HandoffEvidenceItem[]): string {
  if (items.length === 0) return "- None";
  return items
    .map((item) => `- ${item.id}: ${item.sourceKind} ${item.sourcePointer} (${item.timestamp})`)
    .join("\n");
}

function formatList(items: string[]): string {
  if (items.length === 0) return "- None";
  return items.map((item) => `- ${item}`).join("\n");
}

function formatEvidenceSuffix(evidenceIds: string[]): string {
  return evidenceIds.length > 0 ? ` [${evidenceIds.join(", ")}]` : "";
}
