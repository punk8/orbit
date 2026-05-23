import {
  ActivityRepository,
  buildTodayHandoffPack,
  KnowledgeRepository,
  openOrbitDatabase,
  RecommendationRepository,
  runSemanticPipeline,
  runSemanticPipelineWithProvider,
  type SemanticPipelineOptions,
  type SemanticPipelineResult
} from "@orbit/db";
import type { ActivitySession, HandoffPack, KnowledgeArtifact, Recommendation } from "@orbit/core";
import { getCliConfig } from "../config";

export interface PipelineQualitySummary {
  activity: {
    total: number;
    highQuality: number;
    lowQuality: number;
    averageQualityScore: number;
  };
  knowledge: {
    total: number;
    englishDrafts: number;
    chineseDrafts: number;
    generatedFromLowQuality: number;
  };
  recommendations: {
    total: number;
    followUps: number;
    risks: number;
    contextGaps: number;
  };
  handoff: {
    safeSummaryPointersOnly: boolean;
    rawLeakCount: number;
    includedActivity: number;
    includedKnowledge: number;
    includedRecommendations: number;
    evidencePointers: number;
  };
}

export interface PipelineWithQualityResult extends SemanticPipelineResult {
  quality: PipelineQualitySummary;
}

export function runPipelineWithQuality(
  options: SemanticPipelineOptions = {}
): PipelineWithQualityResult {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    const result = runSemanticPipeline(database, readLanguageOption(options));
    return attachQuality(result, { database });
  } finally {
    database.close();
  }
}

export async function runPipelineWithProviderAndQuality(
  options: SemanticPipelineOptions = {}
): Promise<PipelineWithQualityResult> {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    const result = await runSemanticPipelineWithProvider(database, options);
    return attachQuality(result, { database });
  } finally {
    database.close();
  }
}

export function attachQuality(
  result: SemanticPipelineResult,
  input: {
    database: ReturnType<typeof openOrbitDatabase>;
  }
): PipelineWithQualityResult {
  const activitySessions = new ActivityRepository(input.database.db).listActivitySessions();
  const knowledgeArtifacts = new KnowledgeRepository(input.database.db).listKnowledgeArtifacts();
  const recommendations = new RecommendationRepository(input.database.db).listRecommendations();
  const handoff = buildTodayHandoffPack(input.database, { date: inferQualityDate(activitySessions) });
  return {
    ...result,
    quality: buildPipelineQuality({
      activitySessions,
      knowledgeArtifacts,
      recommendations,
      handoff
    })
  };
}

function buildPipelineQuality(input: {
  activitySessions: ActivitySession[];
  knowledgeArtifacts: KnowledgeArtifact[];
  recommendations: Recommendation[];
  handoff: HandoffPack;
}): PipelineQualitySummary {
  const qualityScores = input.activitySessions.map(
    (session) => session.localState.qualityScore ?? 0
  );
  const lowQualitySessionIds = new Set(
    input.activitySessions
      .filter((session) => session.localState.qualitySignals?.isLowQuality === true)
      .map((session) => session.id)
  );
  const rawLeakCount = countRawLeakMarkers(input.handoff);
  return {
    activity: {
      total: input.activitySessions.length,
      highQuality: input.activitySessions.filter(
        (session) =>
          (session.localState.qualityScore ?? 0) >= 0.35 &&
          session.localState.qualitySignals?.isLowQuality !== true
      ).length,
      lowQuality: lowQualitySessionIds.size,
      averageQualityScore: average(qualityScores)
    },
    knowledge: {
      total: input.knowledgeArtifacts.length,
      englishDrafts: input.knowledgeArtifacts.filter(
        (artifact) => artifact.metadata.language === "en"
      ).length,
      chineseDrafts: input.knowledgeArtifacts.filter(
        (artifact) => artifact.metadata.language === "zh-CN"
      ).length,
      generatedFromLowQuality: input.knowledgeArtifacts.filter((artifact) =>
        artifact.metadata.sourceSessionIds.some((id) => lowQualitySessionIds.has(id))
      ).length
    },
    recommendations: {
      total: input.recommendations.length,
      followUps: input.recommendations.filter((item) => item.type === "follow_up").length,
      risks: input.recommendations.filter(
        (item) => item.type === "risk" || item.type === "blocker"
      ).length,
      contextGaps: input.recommendations.filter((item) => item.type === "context_needed").length
    },
    handoff: {
      safeSummaryPointersOnly: rawLeakCount === 0,
      rawLeakCount,
      includedActivity: input.handoff.recentActivity.length,
      includedKnowledge: input.handoff.confirmedKnowledge.length,
      includedRecommendations: input.handoff.recommendedNextActions.length,
      evidencePointers: input.handoff.evidenceIndex.length
    }
  };
}

function readLanguageOption(options: SemanticPipelineOptions): Pick<SemanticPipelineOptions, "language"> {
  return options.language ? { language: options.language } : {};
}

function inferQualityDate(activitySessions: ActivitySession[]): string {
  return activitySessions[0]?.startAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function countRawLeakMarkers(value: unknown): number {
  const pack = value as Partial<HandoffPack>;
  const payload = {
    currentState: pack.currentState,
    completedOrAttempted: pack.completedOrAttempted,
    recentActivity: pack.recentActivity,
    confirmedKnowledge: pack.confirmedKnowledge,
    activeMemories: pack.activeMemories,
    decisions: pack.decisions,
    blockersAndRisks: pack.blockersAndRisks,
    recommendedNextActions: pack.recommendedNextActions,
    nextSteps: pack.nextSteps,
    evidenceIndex: pack.evidenceIndex
  };
  const json = JSON.stringify(payload);
  return [
    /\bRAW_[A-Z0-9_]+\b/g,
    /\braw[-_](?:ocr|screen|frame|payload|dump|event|private)(?:[-_][a-z0-9]+)*\b/gi,
    /\b(?:hunter2|sk-test|password\s*[=:]|api[_ -]?key\s*[=:]|secret\s+token)\b/gi
  ].reduce((count, pattern) => count + (json.match(pattern)?.length ?? 0), 0);
}
