import type { HandoffExclusionReason } from "@orbit/core";
import { explainHandoffExclusion } from "@orbit/core";
import { getTodayHandoff } from "./handoff";
import {
  getTodayContext,
  listActivitySessions,
  listKnowledgeArtifacts,
  listMemories,
  listRecommendations
} from "./readModels";

export type DogfoodNextAction =
  | "capture_or_ingest_source"
  | "review_knowledge"
  | "review_latest_activity_date"
  | "confirm_memory"
  | "allow_source_export"
  | "resolve_redaction"
  | "copy_handoff";

export interface DogfoodReadiness {
  date: string;
  loop: {
    activity: {
      generated: boolean;
      count: number;
    };
    knowledge: {
      reviewable: boolean;
      draft: number;
      confirmed: number;
    };
    memory: {
      candidates: number;
      confirmed: boolean;
      confirmedCount: number;
    };
    recommendations: {
      active: number;
    };
  };
  handoff: {
    readyForAgent: boolean;
    included: {
      activity: number;
      knowledge: number;
      memory: number;
      recommendations: number;
      evidence: number;
    };
    excluded: {
      total: number;
      byReason: Partial<Record<HandoffExclusionReason, number>>;
      explanations: Array<{
        reason: HandoffExclusionReason;
        count: number;
        title: string;
        nextAction: string;
      }>;
    };
  };
  localDataCoverage: {
    hasAnyActivity: boolean;
    latestActivityDate?: string;
    requestedDateHasActivity: boolean;
    explanation?: string;
  };
  nextActions: DogfoodNextAction[];
}

export function getDogfoodReadiness(options: { date: string }): DogfoodReadiness {
  const today = getTodayContext(options.date);
  const handoff = getTodayHandoff({ date: options.date });
  const localDataCoverage = buildLocalDataCoverage(options.date, today.activitySessions.length);
  const knowledgeForDate = listKnowledgeArtifacts().filter((artifact) =>
    artifact.metadata.timeWindow
      ? matchesDate(options.date, artifact.metadata.timeWindow.startAt) ||
        matchesDate(options.date, artifact.metadata.timeWindow.endAt)
      : matchesDate(options.date, artifact.createdAt)
  );
  const draftKnowledge = knowledgeForDate.filter(
    (artifact) => artifact.status === "draft" || artifact.status === "needs_review"
  );
  const confirmedKnowledge = knowledgeForDate.filter((artifact) => artifact.status === "confirmed");
  const memories = listMemories();
  const candidateMemories = memories.filter((memory) => memory.status === "needs_review");
  const confirmedMemories = memories.filter((memory) => memory.status === "confirmed");
  const activeRecommendations = listRecommendations().filter(
    (recommendation) => recommendation.status !== "dismissed" && recommendation.status !== "resolved"
  );
  const byReason = countExcludedByReason(handoff.excluded);
  const readyForAgent =
    handoff.recentActivity.length > 0 &&
    handoff.confirmedKnowledge.length > 0 &&
    handoff.activeMemories.length > 0;

  return {
    date: options.date,
    loop: {
      activity: {
        generated: today.activitySessions.length > 0,
        count: today.activitySessions.length
      },
      knowledge: {
        reviewable: draftKnowledge.length > 0 || confirmedKnowledge.length > 0,
        draft: draftKnowledge.length,
        confirmed: confirmedKnowledge.length
      },
      memory: {
        candidates: candidateMemories.length,
        confirmed: confirmedMemories.length > 0,
        confirmedCount: confirmedMemories.length
      },
      recommendations: {
        active: activeRecommendations.length
      }
    },
    handoff: {
      readyForAgent,
      included: {
        activity: handoff.recentActivity.length,
        knowledge: handoff.confirmedKnowledge.length,
        memory: handoff.activeMemories.length,
        recommendations: handoff.recommendedNextActions.length,
        evidence: handoff.evidenceIndex.length
      },
      excluded: {
        total: handoff.excluded.length,
        byReason,
        explanations: Object.entries(byReason).map(([reason, count]) => {
          const explanation = explainHandoffExclusion(reason as HandoffExclusionReason);
          return {
            reason: reason as HandoffExclusionReason,
            count,
            title: explanation.title,
            nextAction: explanation.nextAction
          };
        })
      }
    },
    localDataCoverage,
    nextActions: buildNextActions({
      activityCount: today.activitySessions.length,
      draftKnowledgeCount: draftKnowledge.length,
      confirmedMemoryCount: confirmedMemories.length,
      hasRecentActivityOnDifferentDate:
        !localDataCoverage.requestedDateHasActivity && localDataCoverage.hasAnyActivity,
      excludedByReason: byReason,
      handoffReady: readyForAgent
    })
  };
}

function buildLocalDataCoverage(
  requestedDate: string,
  activityCountForRequestedDate: number
): DogfoodReadiness["localDataCoverage"] {
  const latestActivityDate = listActivitySessions()
    .map((session) => session.startAt.slice(0, 10))
    .sort()
    .at(-1);
  const requestedDateHasActivity = activityCountForRequestedDate > 0;
  const coverage: DogfoodReadiness["localDataCoverage"] = {
    hasAnyActivity: latestActivityDate !== undefined,
    requestedDateHasActivity
  };
  if (latestActivityDate) {
    coverage.latestActivityDate = latestActivityDate;
  }
  if (!requestedDateHasActivity && latestActivityDate) {
    coverage.explanation = `No Activity Sessions exist for ${requestedDate}. Latest local Activity is on ${latestActivityDate}; run dogfood for that date or ingest today's authorized sources.`;
  } else if (!requestedDateHasActivity) {
    coverage.explanation = `No Activity Sessions exist for ${requestedDate}. Capture or ingest an authorized local source to start the daily loop.`;
  }
  return coverage;
}

function countExcludedByReason(
  excluded: Array<{ reason: HandoffExclusionReason }>
): Partial<Record<HandoffExclusionReason, number>> {
  const counts: Partial<Record<HandoffExclusionReason, number>> = {};
  for (const item of excluded) {
    counts[item.reason] = (counts[item.reason] ?? 0) + 1;
  }
  return counts;
}

function buildNextActions(input: {
  activityCount: number;
  draftKnowledgeCount: number;
  confirmedMemoryCount: number;
  hasRecentActivityOnDifferentDate: boolean;
  excludedByReason: Partial<Record<HandoffExclusionReason, number>>;
  handoffReady: boolean;
}): DogfoodNextAction[] {
  const actions: DogfoodNextAction[] = [];
  if (input.activityCount === 0) actions.push("capture_or_ingest_source");
  if (input.hasRecentActivityOnDifferentDate) actions.push("review_latest_activity_date");
  if (input.draftKnowledgeCount > 0 || input.excludedByReason.draft_knowledge) {
    actions.push("review_knowledge");
  }
  if (input.confirmedMemoryCount === 0) actions.push("confirm_memory");
  if (input.excludedByReason.source_export_blocked) actions.push("allow_source_export");
  if (input.excludedByReason.failed_redaction) actions.push("resolve_redaction");
  if (input.handoffReady) actions.push("copy_handoff");
  return [...new Set(actions)];
}

function matchesDate(date: string, timestamp: string): boolean {
  return timestamp.slice(0, 10) === date;
}
