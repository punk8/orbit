import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { DesktopHandoffResult, DesktopSnapshot } from "../orbitApi";
import type { HandoffExclusionReason, HandoffPack } from "@orbit/core";
import { MetricCard } from "../components/MetricCard";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";

export function HandoffPage({
  snapshot,
  initialResult,
  onGenerateHandoff,
  onOpenActivitySession,
  onOpenKnowledgeArtifact,
  onOpenRecommendation
}: {
  snapshot: DesktopSnapshot;
  initialResult?: DesktopHandoffResult | undefined;
  onGenerateHandoff(
    input: { kind: "today"; date?: string } | { kind: "project"; project: string }
  ): Promise<DesktopHandoffResult>;
  onOpenActivitySession?: ((sessionId: string) => void) | undefined;
  onOpenKnowledgeArtifact?: ((artifactId: string) => void) | undefined;
  onOpenRecommendation?: ((recommendationId: string) => void) | undefined;
}): ReactElement {
  const { t, language } = useI18n();
  const projectOptions = useMemo(() => buildProjectOptions(snapshot), [snapshot]);
  const [project, setProject] = useState(() => projectOptions[0] ?? "");
  const [projectEdited, setProjectEdited] = useState(false);
  const [result, setResult] = useState<DesktopHandoffResult | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewFormat, setPreviewFormat] = useState<"Markdown" | "JSON">("Markdown");
  const metrics = buildHandoffMetrics(snapshot, result, t);
  const showingInitialResult = Boolean(initialResult && result?.handoff.id === initialResult.handoff.id);

  useEffect(() => {
    if (!initialResult) return;
    setResult(initialResult);
    setError(undefined);
    setCopied(false);
  }, [initialResult]);

  useEffect(() => {
    if (projectEdited) return;
    const defaultProject = projectOptions[0] ?? "";
    if (project === defaultProject) return;
    setProject(defaultProject);
  }, [project, projectEdited, projectOptions]);

  async function generate(
    input: { kind: "today"; date?: string } | { kind: "project"; project: string }
  ) {
    setIsGenerating(true);
    setError(undefined);
    setCopied(false);
    try {
      setResult(await onGenerateHandoff(input));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("handoff.error"));
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyMarkdown(): Promise<void> {
    if (!result) return;
    await navigator.clipboard.writeText(result.markdown);
    setCopied(true);
  }

  return (
    <div className="page-grid">
      <div className="metrics-row">
        <MetricCard
          label={t("handoff.safeToExport")}
          value={metrics.safeToExport}
          detail={metrics.safeDetail}
        />
        <MetricCard
          label={t("handoff.preflightTotalRecentActivity")}
          value={metrics.totalRecentActivity}
          detail={metrics.totalRecentActivityDetail}
        />
        <MetricCard
          label={t("handoff.excludedByPolicy")}
          value={metrics.excludedByPolicy}
          detail={metrics.excludedDetail}
        />
        <MetricCard
          label={t("handoff.evidence")}
          value={metrics.evidencePointers}
          detail={metrics.evidenceDetail}
        />
      </div>

      <Section title={t("handoff.generate")}>
        <div className="handoff-controls">
          {showingInitialResult ? (
            <div className="notice-banner inline">{t("handoff.generatedFromToday")}</div>
          ) : null}
          <button
            className="secondary-button"
            data-handoff-action="generate-today"
            disabled={isGenerating}
            onClick={() => void generate({ kind: "today", date: snapshot.date })}
            type="button"
          >
            {t("handoff.today")}
          </button>
          <div className="handoff-project-control">
            <label htmlFor="handoff-project">{t("handoff.projectName")}</label>
            <input
              className="text-input compact-input"
              id="handoff-project"
              list="handoff-project-options"
              onChange={(event) => {
                setProjectEdited(true);
                setProject(event.currentTarget.value);
              }}
              value={project}
            />
            <datalist id="handoff-project-options">
              {projectOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <button
              className="secondary-button"
              data-handoff-action="generate-project"
              disabled={isGenerating || project.trim().length === 0}
              onClick={() => void generate({ kind: "project", project: project.trim() })}
              type="button"
            >
              {t("handoff.project")}
            </button>
            {projectOptions.length === 0 ? (
              <p className="muted">{t("handoff.noProjectOptions")}</p>
            ) : null}
          </div>
        </div>
      </Section>

      {error ? <div className="error-banner">{`${t("handoff.error")}: ${error}`}</div> : null}

      {result ? (
        <HandoffSafetySummary
          pack={result.handoff}
          safeToExport={metrics.safeToExport}
          excludedByPolicy={metrics.excludedByPolicy}
        />
      ) : null}

      {result ? (
        <div className="page-grid two-column compact-page-grid">
          <Section title={t("handoff.currentState")}>
            <HandoffBulletList
              items={formatCurrentStateForDisplay(result.handoff, language === "zh-CN")}
            />
          </Section>
          <Section title={t("handoff.completedOrAttempted")}>
            {result.handoff.completedOrAttempted.length > 0 ? (
              <div className="item-list compact">
                {result.handoff.completedOrAttempted.map((item) => (
                  <article className="list-item vertical" key={item.id}>
                    <h3>{item.title}</h3>
                    <p>{t(`handoff.progress.${item.status}`)}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">{t("handoff.noneCompletedOrAttempted")}</div>
            )}
          </Section>
        </div>
      ) : null}

      {result ? (
        <Section title={t("handoff.nextSteps")}>
          {result.handoff.nextSteps.length > 0 ? (
            <div className="item-list compact">
              {result.handoff.nextSteps.map((step) => (
                <article className="list-item vertical" key={step.id}>
                  <h3>{step.title}</h3>
                  <p>{step.action}</p>
                  <p className="muted">{`${t("handoff.nextStepConfidence")}: ${step.confidence} · ${t(
                    "filter.impact"
                  )}: ${step.impact}`}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">{t("handoff.noNextSteps")}</div>
          )}
        </Section>
      ) : null}

      {result ? (
        <Section title={t("handoff.excluded")}>
          {result.handoff.excluded.length > 0 ? (
            <div className="item-list compact handoff-excluded-list">
              {result.handoff.excluded.map((excluded) => (
                <article
                  className="list-item vertical"
                  key={`${excluded.objectType}:${excluded.objectId}:${excluded.reason}`}
                >
                  <h3>{`${t(`handoff.object.${excluded.objectType}`)} · ${handoffExclusionReasonLabel(
                    t,
                    excluded.reason
                  )}`}</h3>
                  <p>{excluded.objectId}</p>
                  <p className="muted">{`${t("handoff.exclusion.reason")}: ${handoffExclusionDescription(
                    t,
                    excluded.reason
                  )}`}</p>
                  <p className="muted">{`${t("handoff.exclusion.nextAction")}: ${handoffExclusionNextAction(
                    t,
                    excluded.reason
                  )}`}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">{t("handoff.noExcluded")}</div>
          )}
        </Section>
      ) : null}

      <Section
        title={t("handoff.preview")}
        action={
          result ? (
            <div className="handoff-preview-actions">
              <div className="segmented-control" aria-label={t("handoff.preview")}>
                <button
                  className={previewFormat === "Markdown" ? "active" : ""}
                  onClick={() => setPreviewFormat("Markdown")}
                  type="button"
                >
                  Markdown
                </button>
                <button
                  className={previewFormat === "JSON" ? "active" : ""}
                  onClick={() => setPreviewFormat("JSON")}
                  type="button"
                >
                  JSON
                </button>
              </div>
              <button className="secondary-button" onClick={() => void copyMarkdown()} type="button">
                {copied ? t("handoff.copied") : t("handoff.copyMarkdown")}
              </button>
            </div>
          ) : null
        }
      >
        {result ? (
          <pre className="handoff-preview">
            {previewFormat === "JSON" ? JSON.stringify(result.handoff, null, 2) : result.markdown}
          </pre>
        ) : (
          <div className="empty-state">{t("handoff.empty")}</div>
        )}
      </Section>

      {result ? (
        <div className="page-grid two-column compact-page-grid">
          <Section title={t("handoff.safetyBoundaries")}>
            <div className="item-list compact">
              {result.handoff.safetyBoundaries.map((boundary) => (
                <article className="list-item vertical" key={boundary.kind}>
                  <h3>{boundary.title}</h3>
                  <p>{boundary.description}</p>
                </article>
              ))}
            </div>
          </Section>
          <Section title={t("handoff.evidence")}>
            <div className="item-list compact">
              {result.handoff.evidenceIndex.map((evidence) => (
                <HandoffEvidenceCard
                  evidence={evidence}
                  key={evidence.id}
                  onOpenActivitySession={onOpenActivitySession}
                  onOpenKnowledgeArtifact={onOpenKnowledgeArtifact}
                  onOpenRecommendation={onOpenRecommendation}
                />
              ))}
            </div>
          </Section>
        </div>
      ) : null}
    </div>
  );
}

function HandoffEvidenceCard({
  evidence,
  onOpenActivitySession,
  onOpenKnowledgeArtifact,
  onOpenRecommendation
}: {
  evidence: HandoffPack["evidenceIndex"][number];
  onOpenActivitySession: ((sessionId: string) => void) | undefined;
  onOpenKnowledgeArtifact: ((artifactId: string) => void) | undefined;
  onOpenRecommendation: ((recommendationId: string) => void) | undefined;
}): ReactElement {
  const { t, sourceKind } = useI18n();
  return (
    <article className="list-item vertical handoff-evidence-card">
      <div className="item-heading">
        <h3>{`${t(`handoff.object.${evidence.objectType}`)} · ${sourceKind(
          evidence.sourceKind
        )}`}</h3>
        {renderHandoffEvidenceAction({
          evidence,
          onOpenActivitySession,
          onOpenKnowledgeArtifact,
          onOpenRecommendation,
          t
        })}
      </div>
      <p className="muted">{`${t("handoff.evidenceSourceObject")}: ${evidence.objectId}`}</p>
      <code>{evidence.sourcePointer}</code>
    </article>
  );
}

function renderHandoffEvidenceAction({
  evidence,
  onOpenActivitySession,
  onOpenKnowledgeArtifact,
  onOpenRecommendation,
  t
}: {
  evidence: HandoffPack["evidenceIndex"][number];
  onOpenActivitySession: ((sessionId: string) => void) | undefined;
  onOpenKnowledgeArtifact: ((artifactId: string) => void) | undefined;
  onOpenRecommendation: ((recommendationId: string) => void) | undefined;
  t: ReturnType<typeof useI18n>["t"];
}): ReactElement | null {
  if (evidence.objectType === "activity" && onOpenActivitySession) {
    return (
      <button
        className="secondary-button"
        data-handoff-action="open-evidence-activity"
        onClick={() => onOpenActivitySession(evidence.objectId)}
        type="button"
      >
        {t("handoff.openEvidenceActivity")}
      </button>
    );
  }
  if (evidence.objectType === "knowledge" && onOpenKnowledgeArtifact) {
    return (
      <button
        className="secondary-button"
        data-handoff-action="open-evidence-knowledge"
        onClick={() => onOpenKnowledgeArtifact(evidence.objectId)}
        type="button"
      >
        {t("handoff.openEvidenceKnowledge")}
      </button>
    );
  }
  if (evidence.objectType === "recommendation" && onOpenRecommendation) {
    return (
      <button
        className="secondary-button"
        data-handoff-action="open-evidence-recommendation"
        onClick={() => onOpenRecommendation(evidence.objectId)}
        type="button"
      >
        {t("handoff.openEvidenceRecommendation")}
      </button>
    );
  }
  return null;
}

function buildProjectOptions(snapshot: DesktopSnapshot): string[] {
  return Array.from(
    new Set(
      [
        ...snapshot.activitySessions.map((session) => session.project),
        ...snapshot.knowledgeArtifacts.flatMap((artifact) => artifact.metadata.projects),
        ...snapshot.memories.map((memory) => memory.scope.project)
      ]
        .map((project) => project?.trim())
        .filter((project): project is string => Boolean(project))
    )
  ).sort((left, right) => left.localeCompare(right));
}

function HandoffBulletList({ items }: { items: string[] }): ReactElement {
  if (items.length === 0) {
    return <div className="empty-state compact">None</div>;
  }
  return (
    <ul className="handoff-bullet-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function HandoffSafetySummary({
  pack,
  safeToExport,
  excludedByPolicy
}: {
  pack: HandoffPack;
  safeToExport: number | string;
  excludedByPolicy: number | string;
}): ReactElement {
  const { t } = useI18n();
  return (
    <Section title={t("handoff.safetySummary")}>
      <div className="handoff-safety-summary">
        <div>
          <p className="eyebrow">{t("handoff.safeToExport")}</p>
          <strong>{safeToExport}</strong>
          <span>{t("handoff.safeToExportDetail")}</span>
        </div>
        <div>
          <p className="eyebrow">{t("handoff.excludedByPolicy")}</p>
          <strong>{excludedByPolicy}</strong>
          <span>{t("handoff.excludedByPolicyDetail")}</span>
        </div>
        <div>
          <p className="eyebrow">{t("handoff.evidence")}</p>
          <strong>{pack.evidenceIndex.length}</strong>
          <span>{t("handoff.evidenceDetail")}</span>
        </div>
      </div>
    </Section>
  );
}

function buildHandoffMetrics(
  snapshot: DesktopSnapshot,
  result: DesktopHandoffResult | undefined,
  t: ReturnType<typeof useI18n>["t"]
): {
  safeToExport: number | string;
  safeDetail: string;
  totalRecentActivity: number;
  totalRecentActivityDetail: string;
  excludedByPolicy: number | string;
  excludedDetail: string;
  evidencePointers: number;
  evidenceDetail: string;
} {
  if (!result) {
    return {
      safeToExport: t("handoff.notGenerated"),
      safeDetail: t("handoff.safePendingDetail"),
      totalRecentActivity: snapshot.today.activitySessions.length,
      totalRecentActivityDetail: t("handoff.preflightTotalRecentActivityDetail"),
      excludedByPolicy: t("handoff.notGenerated"),
      excludedDetail: t("handoff.excludedPendingDetail"),
      evidencePointers: 0,
      evidenceDetail: t("handoff.evidencePendingDetail")
    };
  }
  const pack = result.handoff;
  return {
    safeToExport:
      pack.recentActivity.length +
      pack.confirmedKnowledge.length +
      pack.activeMemories.length +
      pack.recommendedNextActions.length,
    safeDetail: t("handoff.safeToExportDetail"),
    totalRecentActivity: snapshot.today.activitySessions.length,
    totalRecentActivityDetail: t("handoff.preflightTotalRecentActivityDetail"),
    excludedByPolicy: pack.excluded.length,
    excludedDetail: t("handoff.excludedByPolicyDetail"),
    evidencePointers: pack.evidenceIndex.length,
    evidenceDetail: t("handoff.evidenceDetail")
  };
}

function formatCurrentStateForDisplay(pack: HandoffPack, zh: boolean): string[] {
  if (!zh) return pack.currentState;
  return [
    `当前目标：${formatObjectiveForDisplay(pack.objective)}`,
    `可交给 Agent 的最近活动：${pack.recentActivity.length}`,
    `已确认知识：${pack.confirmedKnowledge.length}`,
    `已确认记忆：${pack.activeMemories.length}`,
    `未关闭建议：${pack.recommendedNextActions.length}`,
    `阻塞或风险：${pack.blockersAndRisks.length}`,
    `可追溯证据指针：${pack.evidenceIndex.length}`,
    `已排除且带原因的内容：${pack.excluded.length}`
  ];
}

function formatObjectiveForDisplay(objective: string): string {
  if (objective.startsWith("Continue project ")) {
    return `继续项目 ${objective.slice("Continue project ".length)}`;
  }
  if (objective.startsWith("Continue work for ")) {
    return `继续 ${objective.slice("Continue work for ".length)} 的工作`;
  }
  return objective;
}

function handoffExclusionReasonLabel(
  t: ReturnType<typeof useI18n>["t"],
  reason: HandoffExclusionReason
): string {
  if (reason === "draft_knowledge") return t("handoff.exclusion.draftKnowledge");
  if (reason === "memory_not_confirmed") return t("handoff.exclusion.memoryNotConfirmed");
  if (reason === "recommendation_terminal") return t("handoff.exclusion.recommendationTerminal");
  if (reason === "missing_evidence") return t("handoff.exclusion.missingEvidence");
  if (reason === "secret_content") return t("handoff.exclusion.secretContent");
  if (reason === "failed_redaction") return t("handoff.exclusion.failedRedaction");
  if (reason === "raw_payload_excluded") return t("handoff.exclusion.rawPayloadExcluded");
  if (reason === "private_payload_excluded") return t("handoff.exclusion.privatePayloadExcluded");
  return t("handoff.exclusion.sourceExportBlocked");
}

function handoffExclusionDescription(
  t: ReturnType<typeof useI18n>["t"],
  reason: HandoffExclusionReason
): string {
  if (reason === "draft_knowledge") return t("handoff.exclusion.description.draftKnowledge");
  if (reason === "memory_not_confirmed") {
    return t("handoff.exclusion.description.memoryNotConfirmed");
  }
  if (reason === "recommendation_terminal") {
    return t("handoff.exclusion.description.recommendationTerminal");
  }
  if (reason === "missing_evidence") return t("handoff.exclusion.description.missingEvidence");
  if (reason === "secret_content") return t("handoff.exclusion.description.secretContent");
  if (reason === "failed_redaction") return t("handoff.exclusion.description.failedRedaction");
  if (reason === "raw_payload_excluded") {
    return t("handoff.exclusion.description.rawPayloadExcluded");
  }
  if (reason === "private_payload_excluded") {
    return t("handoff.exclusion.description.privatePayloadExcluded");
  }
  return t("handoff.exclusion.description.sourceExportBlocked");
}

function handoffExclusionNextAction(
  t: ReturnType<typeof useI18n>["t"],
  reason: HandoffExclusionReason
): string {
  if (reason === "draft_knowledge") return t("handoff.exclusion.nextAction.reviewKnowledge");
  if (reason === "memory_not_confirmed") return t("handoff.exclusion.nextAction.confirmMemory");
  if (reason === "recommendation_terminal") {
    return t("handoff.exclusion.nextAction.reopenRecommendation");
  }
  if (reason === "missing_evidence") return t("handoff.exclusion.nextAction.rebuildEvidence");
  if (reason === "secret_content") return t("handoff.exclusion.nextAction.redactSecret");
  if (reason === "failed_redaction") return t("handoff.exclusion.nextAction.fixRedaction");
  if (reason === "raw_payload_excluded") return t("handoff.exclusion.nextAction.useSummary");
  if (reason === "private_payload_excluded") return t("handoff.exclusion.nextAction.redactPrivate");
  return t("handoff.exclusion.nextAction.allowExport");
}
