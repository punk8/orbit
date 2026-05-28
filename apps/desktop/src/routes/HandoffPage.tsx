import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { DesktopHandoffResult, DesktopPageId, DesktopSnapshot } from "../orbitApi";
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
  onOpenMemory,
  onOpenRecommendation,
  onNavigate
}: {
  snapshot: DesktopSnapshot;
  initialResult?: DesktopHandoffResult | undefined;
  onGenerateHandoff(
    input: { kind: "today"; date?: string } | { kind: "project"; project: string }
  ): Promise<DesktopHandoffResult>;
  onOpenActivitySession?: ((sessionId: string) => void) | undefined;
  onOpenKnowledgeArtifact?: ((artifactId: string) => void) | undefined;
  onOpenMemory?: ((memoryId: string) => void) | undefined;
  onOpenRecommendation?: ((recommendationId: string) => void) | undefined;
  onNavigate(page: DesktopPageId): void;
}): ReactElement {
  const { t, language } = useI18n();
  const projectOptions = useMemo(() => buildProjectOptions(snapshot), [snapshot]);
  const [project, setProject] = useState(() => projectOptions[0] ?? "");
  const [projectEdited, setProjectEdited] = useState(false);
  const [result, setResult] = useState<DesktopHandoffResult | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [copiedFormat, setCopiedFormat] = useState<"Markdown" | "JSON" | undefined>();
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewFormat, setPreviewFormat] = useState<"Markdown" | "JSON">("Markdown");
  const metrics = buildHandoffMetrics(snapshot, result, t);
  const showingInitialResult = Boolean(
    initialResult && result?.handoff.id === initialResult.handoff.id
  );

  useEffect(() => {
    if (!initialResult) return;
    setResult(initialResult);
    setError(undefined);
    setCopiedFormat(undefined);
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
    setCopiedFormat(undefined);
    try {
      setResult(await onGenerateHandoff(input));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("handoff.error"));
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyPreview(): Promise<void> {
    if (!result) return;
    const preview =
      previewFormat === "JSON" ? JSON.stringify(result.handoff, null, 2) : result.markdown;
    await navigator.clipboard.writeText(preview);
    setCopiedFormat(previewFormat);
  }

  function selectPreviewFormat(format: "Markdown" | "JSON"): void {
    setPreviewFormat(format);
    setCopiedFormat(undefined);
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

      {result ? <HandoffGeneratedScopeSummary pack={result.handoff} /> : null}

      {result ? (
        <HandoffSafetySummary
          pack={result.handoff}
          safeToExport={metrics.safeToExport}
          excludedByPolicy={metrics.excludedByPolicy}
        />
      ) : null}

      {result ? (
        <HandoffIncludedSection
          pack={result.handoff}
          onOpenActivitySession={onOpenActivitySession}
          onOpenKnowledgeArtifact={onOpenKnowledgeArtifact}
          onOpenMemory={onOpenMemory}
          onOpenRecommendation={onOpenRecommendation}
        />
      ) : null}

      {result ? (
        <HandoffDecisionRiskSection
          pack={result.handoff}
          onOpenKnowledgeArtifact={onOpenKnowledgeArtifact}
          onOpenMemory={onOpenMemory}
          onOpenRecommendation={onOpenRecommendation}
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
                <HandoffExcludedCard
                  excluded={excluded}
                  key={`${excluded.objectType}:${excluded.objectId}:${excluded.reason}`}
                  onOpenKnowledgeArtifact={onOpenKnowledgeArtifact}
                  onOpenMemory={onOpenMemory}
                  onOpenRecommendation={onOpenRecommendation}
                />
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
                  onClick={() => selectPreviewFormat("Markdown")}
                  type="button"
                >
                  Markdown
                </button>
                <button
                  className={previewFormat === "JSON" ? "active" : ""}
                  onClick={() => selectPreviewFormat("JSON")}
                  type="button"
                >
                  JSON
                </button>
              </div>
              <button className="secondary-button" onClick={() => void copyPreview()} type="button">
                {copiedFormat === "JSON"
                  ? t("handoff.copiedJson")
                  : copiedFormat === "Markdown"
                    ? t("handoff.copiedMarkdown")
                    : t("handoff.copyPreview")}
              </button>
            </div>
          ) : null
        }
      >
        {result ? (
          <>
            <p className="handoff-preview-copy-boundary">{t("handoff.previewCopyBoundary")}</p>
            <pre className="handoff-preview">
              {previewFormat === "JSON" ? JSON.stringify(result.handoff, null, 2) : result.markdown}
            </pre>
          </>
        ) : (
          <HandoffEmptyWorkflow
            isGenerating={isGenerating}
            onGenerateToday={() => void generate({ kind: "today", date: snapshot.date })}
            onNavigate={onNavigate}
          />
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

function HandoffEmptyWorkflow({
  isGenerating,
  onGenerateToday,
  onNavigate
}: {
  isGenerating: boolean;
  onGenerateToday(): void;
  onNavigate(page: DesktopPageId): void;
}): ReactElement {
  const { t } = useI18n();
  return (
    <section className="handoff-empty-workflow" aria-label={t("handoff.empty.title")}>
      <div className="handoff-empty-copy">
        <p className="eyebrow">{t("handoff.empty")}</p>
        <h2>{t("handoff.empty.title")}</h2>
        <p>{t("handoff.empty.description")}</p>
        <div className="meta-line handoff-empty-boundary">
          <span>{t("handoff.empty.agentSafeBoundary")}</span>
          <span>{t("source.rawNotStored")}</span>
          <span>{t("source.agentExportBlocked")}</span>
        </div>
      </div>
      <div className="handoff-empty-actions">
        <button
          className="secondary-button"
          data-handoff-action="empty-generate-today"
          disabled={isGenerating}
          onClick={onGenerateToday}
          type="button"
        >
          {isGenerating ? t("handoff.generating") : t("handoff.empty.generateToday")}
        </button>
        <button className="secondary-button" onClick={() => onNavigate("review")} type="button">
          {t("handoff.empty.openReview")}
        </button>
        <button className="secondary-button" onClick={() => onNavigate("activity")} type="button">
          {t("handoff.empty.openActivity")}
        </button>
        <button className="secondary-button" onClick={() => onNavigate("sources")} type="button">
          {t("handoff.empty.openSources")}
        </button>
      </div>
    </section>
  );
}

function HandoffDecisionRiskSection({
  pack,
  onOpenKnowledgeArtifact,
  onOpenMemory,
  onOpenRecommendation
}: {
  pack: HandoffPack;
  onOpenKnowledgeArtifact: ((artifactId: string) => void) | undefined;
  onOpenMemory: ((memoryId: string) => void) | undefined;
  onOpenRecommendation: ((recommendationId: string) => void) | undefined;
}): ReactElement {
  const { t } = useI18n();
  return (
    <div className="page-grid two-column compact-page-grid">
      <Section title={t("handoff.decisions")}>
        {pack.decisions.length > 0 ? (
          <div className="item-list compact">
            {pack.decisions.map((decision) => (
              <HandoffDecisionCard
                decision={decision}
                key={decision.id}
                onOpenKnowledgeArtifact={onOpenKnowledgeArtifact}
                onOpenMemory={onOpenMemory}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">{t("handoff.noDecisions")}</div>
        )}
      </Section>
      <Section title={t("handoff.blockersAndRisks")}>
        {pack.blockersAndRisks.length > 0 ? (
          <div className="item-list compact">
            {pack.blockersAndRisks.map((risk) => (
              <HandoffRiskCard
                key={risk.id}
                onOpenKnowledgeArtifact={onOpenKnowledgeArtifact}
                onOpenRecommendation={onOpenRecommendation}
                risk={risk}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">{t("handoff.noBlockersAndRisks")}</div>
        )}
      </Section>
    </div>
  );
}

function HandoffDecisionCard({
  decision,
  onOpenKnowledgeArtifact,
  onOpenMemory
}: {
  decision: HandoffPack["decisions"][number];
  onOpenKnowledgeArtifact: ((artifactId: string) => void) | undefined;
  onOpenMemory: ((memoryId: string) => void) | undefined;
}): ReactElement {
  const { t } = useI18n();
  return (
    <article className="list-item vertical">
      <div className="item-heading">
        <h3>{decision.title}</h3>
        {renderHandoffSourceAction({
          dataActionPrefix: "open-decision",
          objectId: decision.sourceObjectId,
          objectType: decision.sourceObjectType,
          onOpenKnowledgeArtifact,
          onOpenMemory,
          t
        })}
      </div>
      <p className="muted">
        {[
          `${t("handoff.evidenceCount")}: ${decision.evidenceIds.length}`,
          `${t("handoff.evidenceSourceObject")}: ${decision.sourceObjectId}`
        ].join(" · ")}
      </p>
    </article>
  );
}

function HandoffRiskCard({
  risk,
  onOpenKnowledgeArtifact,
  onOpenRecommendation
}: {
  risk: HandoffPack["blockersAndRisks"][number];
  onOpenKnowledgeArtifact: ((artifactId: string) => void) | undefined;
  onOpenRecommendation: ((recommendationId: string) => void) | undefined;
}): ReactElement {
  const { t } = useI18n();
  return (
    <article className="list-item vertical">
      <div className="item-heading">
        <h3>{risk.title}</h3>
        {renderHandoffSourceAction({
          dataActionPrefix: "open-risk",
          objectId: risk.sourceObjectId,
          objectType: risk.sourceObjectType,
          onOpenKnowledgeArtifact,
          onOpenRecommendation,
          t
        })}
      </div>
      {risk.suggestedAction ? <p>{risk.suggestedAction}</p> : null}
      <p className="muted">
        {[
          risk.impact ? `${t("filter.impact")}: ${risk.impact}` : undefined,
          `${t("handoff.evidenceCount")}: ${risk.evidenceIds.length}`,
          `${t("handoff.evidenceSourceObject")}: ${risk.sourceObjectId}`
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </article>
  );
}

function renderHandoffSourceAction({
  dataActionPrefix,
  objectId,
  objectType,
  onOpenKnowledgeArtifact,
  onOpenMemory,
  onOpenRecommendation,
  t
}: {
  dataActionPrefix: "open-decision" | "open-risk";
  objectId: string;
  objectType: "knowledge" | "memory" | "recommendation";
  onOpenKnowledgeArtifact?: ((artifactId: string) => void) | undefined;
  onOpenMemory?: ((memoryId: string) => void) | undefined;
  onOpenRecommendation?: ((recommendationId: string) => void) | undefined;
  t: ReturnType<typeof useI18n>["t"];
}): ReactElement | null {
  if (
    objectType === "knowledge" &&
    dataActionPrefix === "open-decision" &&
    onOpenKnowledgeArtifact
  ) {
    return (
      <button
        className="secondary-button"
        data-handoff-action="open-decision-knowledge"
        onClick={() => onOpenKnowledgeArtifact(objectId)}
        type="button"
      >
        {t("handoff.openDecisionKnowledge")}
      </button>
    );
  }
  if (objectType === "knowledge" && dataActionPrefix === "open-risk" && onOpenKnowledgeArtifact) {
    return (
      <button
        className="secondary-button"
        data-handoff-action="open-risk-knowledge"
        onClick={() => onOpenKnowledgeArtifact(objectId)}
        type="button"
      >
        {t("handoff.openRiskKnowledge")}
      </button>
    );
  }
  if (objectType === "memory" && dataActionPrefix === "open-decision" && onOpenMemory) {
    return (
      <button
        className="secondary-button"
        data-handoff-action="open-decision-memory"
        onClick={() => onOpenMemory(objectId)}
        type="button"
      >
        {t("handoff.openDecisionMemory")}
      </button>
    );
  }
  if (objectType === "recommendation" && dataActionPrefix === "open-risk" && onOpenRecommendation) {
    return (
      <button
        className="secondary-button"
        data-handoff-action="open-risk-recommendation"
        onClick={() => onOpenRecommendation(objectId)}
        type="button"
      >
        {t("handoff.openRiskRecommendation")}
      </button>
    );
  }
  return null;
}

function HandoffIncludedSection({
  pack,
  onOpenActivitySession,
  onOpenKnowledgeArtifact,
  onOpenMemory,
  onOpenRecommendation
}: {
  pack: HandoffPack;
  onOpenActivitySession: ((sessionId: string) => void) | undefined;
  onOpenKnowledgeArtifact: ((artifactId: string) => void) | undefined;
  onOpenMemory: ((memoryId: string) => void) | undefined;
  onOpenRecommendation: ((recommendationId: string) => void) | undefined;
}): ReactElement {
  const { t } = useI18n();
  const includedCount =
    pack.recentActivity.length +
    pack.confirmedKnowledge.length +
    pack.activeMemories.length +
    pack.recommendedNextActions.length;

  return (
    <Section title={t("handoff.included")}>
      {includedCount > 0 ? (
        <div className="page-grid two-column compact-page-grid">
          <div className="handoff-included-group">
            <h3>{t("handoff.includedRecentActivity")}</h3>
            {pack.recentActivity.length > 0 ? (
              <div className="item-list compact">
                {pack.recentActivity.map((activity) => (
                  <HandoffIncludedActivityCard
                    activity={activity}
                    key={activity.id}
                    onOpenActivitySession={onOpenActivitySession}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state compact">{t("handoff.noIncludedRecentActivity")}</div>
            )}
          </div>

          <div className="handoff-included-group">
            <h3>{t("handoff.includedConfirmedKnowledge")}</h3>
            {pack.confirmedKnowledge.length > 0 ? (
              <div className="item-list compact">
                {pack.confirmedKnowledge.map((knowledge) => (
                  <HandoffIncludedKnowledgeCard
                    knowledge={knowledge}
                    key={knowledge.id}
                    onOpenKnowledgeArtifact={onOpenKnowledgeArtifact}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state compact">{t("handoff.noIncludedConfirmedKnowledge")}</div>
            )}
          </div>

          <div className="handoff-included-group">
            <h3>{t("handoff.includedActiveMemory")}</h3>
            {pack.activeMemories.length > 0 ? (
              <div className="item-list compact">
                {pack.activeMemories.map((memory) => (
                  <HandoffIncludedMemoryCard
                    key={memory.id}
                    memory={memory}
                    onOpenMemory={onOpenMemory}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state compact">{t("handoff.noIncludedActiveMemory")}</div>
            )}
          </div>

          <div className="handoff-included-group">
            <h3>{t("handoff.includedRecommendations")}</h3>
            {pack.recommendedNextActions.length > 0 ? (
              <div className="item-list compact">
                {pack.recommendedNextActions.map((recommendation) => (
                  <HandoffIncludedRecommendationCard
                    key={recommendation.id}
                    onOpenRecommendation={onOpenRecommendation}
                    recommendation={recommendation}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state compact">{t("handoff.noIncludedRecommendations")}</div>
            )}
          </div>
        </div>
      ) : (
        <div className="empty-state">{t("handoff.noIncluded")}</div>
      )}
    </Section>
  );
}

function HandoffIncludedActivityCard({
  activity,
  onOpenActivitySession
}: {
  activity: HandoffPack["recentActivity"][number];
  onOpenActivitySession: ((sessionId: string) => void) | undefined;
}): ReactElement {
  const { t, sourceKind } = useI18n();
  return (
    <article className="list-item vertical">
      <div className="item-heading">
        <h3>{activity.title}</h3>
        {onOpenActivitySession ? (
          <button
            className="secondary-button"
            data-handoff-action="open-included-activity"
            onClick={() => onOpenActivitySession(activity.id)}
            type="button"
          >
            {t("handoff.openIncludedActivity")}
          </button>
        ) : null}
      </div>
      {activity.summary ? <p>{activity.summary}</p> : null}
      <p className="muted">
        {[
          activity.project,
          activity.apps.join(", "),
          activity.sourceKinds.map((kind) => sourceKind(kind)).join(", ")
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p className="muted">{formatEvidenceCount(t, activity.evidenceIds.length)}</p>
    </article>
  );
}

function HandoffIncludedKnowledgeCard({
  knowledge,
  onOpenKnowledgeArtifact
}: {
  knowledge: HandoffPack["confirmedKnowledge"][number];
  onOpenKnowledgeArtifact: ((artifactId: string) => void) | undefined;
}): ReactElement {
  const { t } = useI18n();
  return (
    <article className="list-item vertical">
      <div className="item-heading">
        <h3>{knowledge.title}</h3>
        {onOpenKnowledgeArtifact ? (
          <button
            className="secondary-button"
            data-handoff-action="open-included-knowledge"
            onClick={() => onOpenKnowledgeArtifact(knowledge.id)}
            type="button"
          >
            {t("handoff.openIncludedKnowledge")}
          </button>
        ) : null}
      </div>
      <p>{knowledge.description}</p>
      <p className="muted">
        {[
          knowledge.type,
          `${t("handoff.nextStepConfidence")}: ${knowledge.confidence}`,
          formatEvidenceCount(t, knowledge.evidenceIds.length)
        ].join(" · ")}
      </p>
    </article>
  );
}

function HandoffIncludedMemoryCard({
  memory,
  onOpenMemory
}: {
  memory: HandoffPack["activeMemories"][number];
  onOpenMemory: ((memoryId: string) => void) | undefined;
}): ReactElement {
  const { t } = useI18n();
  return (
    <article className="list-item vertical">
      <div className="item-heading">
        <h3>{memory.title}</h3>
        {onOpenMemory ? (
          <button
            className="secondary-button"
            data-handoff-action="open-included-memory"
            onClick={() => onOpenMemory(memory.id)}
            type="button"
          >
            {t("handoff.openIncludedMemory")}
          </button>
        ) : null}
      </div>
      <p>{memory.body}</p>
      <p className="muted">
        {[memory.kind, memory.tags.join(", "), formatEvidenceCount(t, memory.evidenceIds.length)]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </article>
  );
}

function HandoffIncludedRecommendationCard({
  recommendation,
  onOpenRecommendation
}: {
  recommendation: HandoffPack["recommendedNextActions"][number];
  onOpenRecommendation: ((recommendationId: string) => void) | undefined;
}): ReactElement {
  const { t } = useI18n();
  return (
    <article className="list-item vertical">
      <div className="item-heading">
        <h3>{recommendation.title}</h3>
        {onOpenRecommendation ? (
          <button
            className="secondary-button"
            data-handoff-action="open-included-recommendation"
            onClick={() => onOpenRecommendation(recommendation.id)}
            type="button"
          >
            {t("handoff.openIncludedRecommendation")}
          </button>
        ) : null}
      </div>
      <p>{recommendation.suggestedAction}</p>
      <p className="muted">
        {[
          `${t("handoff.nextStepConfidence")}: ${recommendation.confidence}`,
          `${t("filter.impact")}: ${recommendation.impact}`,
          formatEvidenceCount(t, recommendation.evidenceIds.length)
        ].join(" · ")}
      </p>
    </article>
  );
}

function formatEvidenceCount(t: ReturnType<typeof useI18n>["t"], count: number): string {
  return `${t("handoff.evidenceCount")}: ${count}`;
}

function HandoffExcludedCard({
  excluded,
  onOpenKnowledgeArtifact,
  onOpenMemory,
  onOpenRecommendation
}: {
  excluded: HandoffPack["excluded"][number];
  onOpenKnowledgeArtifact: ((artifactId: string) => void) | undefined;
  onOpenMemory: ((memoryId: string) => void) | undefined;
  onOpenRecommendation: ((recommendationId: string) => void) | undefined;
}): ReactElement {
  const { t } = useI18n();
  return (
    <article className="list-item vertical">
      <div className="item-heading">
        <h3>{`${t(`handoff.object.${excluded.objectType}`)} · ${handoffExclusionReasonLabel(
          t,
          excluded.reason
        )}`}</h3>
        {renderHandoffExclusionAction({
          excluded,
          onOpenKnowledgeArtifact,
          onOpenMemory,
          onOpenRecommendation,
          t
        })}
      </div>
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
  );
}

function renderHandoffExclusionAction({
  excluded,
  onOpenKnowledgeArtifact,
  onOpenMemory,
  onOpenRecommendation,
  t
}: {
  excluded: HandoffPack["excluded"][number];
  onOpenKnowledgeArtifact: ((artifactId: string) => void) | undefined;
  onOpenMemory: ((memoryId: string) => void) | undefined;
  onOpenRecommendation: ((recommendationId: string) => void) | undefined;
  t: ReturnType<typeof useI18n>["t"];
}): ReactElement | null {
  if (excluded.objectType === "knowledge" && onOpenKnowledgeArtifact) {
    return (
      <button
        className="secondary-button"
        data-handoff-action="review-excluded-knowledge"
        onClick={() => onOpenKnowledgeArtifact(excluded.objectId)}
        type="button"
      >
        {t("handoff.reviewExcludedKnowledge")}
      </button>
    );
  }
  if (excluded.objectType === "memory" && onOpenMemory) {
    return (
      <button
        className="secondary-button"
        data-handoff-action="review-excluded-memory"
        onClick={() => onOpenMemory(excluded.objectId)}
        type="button"
      >
        {t("handoff.reviewExcludedMemory")}
      </button>
    );
  }
  if (excluded.objectType === "recommendation" && onOpenRecommendation) {
    return (
      <button
        className="secondary-button"
        data-handoff-action="review-excluded-recommendation"
        onClick={() => onOpenRecommendation(excluded.objectId)}
        type="button"
      >
        {t("handoff.reviewExcludedRecommendation")}
      </button>
    );
  }
  return null;
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

function HandoffGeneratedScopeSummary({ pack }: { pack: HandoffPack }): ReactElement {
  const { t, formatDate } = useI18n();
  const summary = buildHandoffScopeSummary(pack, t, formatDate);

  return (
    <Section title={t("handoff.generatedScope")}>
      <div className="handoff-scope-summary">
        <div>
          <p className="eyebrow">{t("handoff.scopeKind")}</p>
          <strong>{summary.kind}</strong>
          <span>{summary.value}</span>
        </div>
        <div>
          <p className="eyebrow">{t("handoff.generatedAt")}</p>
          <strong>{summary.generatedAt}</strong>
          <span>{summary.objective}</span>
        </div>
        <div>
          <p className="eyebrow">{t("handoff.scopeIncluded")}</p>
          <strong>{summary.included}</strong>
          <span>{summary.includedDetail}</span>
        </div>
        <div>
          <p className="eyebrow">{t("handoff.scopeExcluded")}</p>
          <strong>{summary.excluded}</strong>
          <span>{t("handoff.excludedByPolicyDetail")}</span>
        </div>
        <div>
          <p className="eyebrow">{t("handoff.scopeEvidence")}</p>
          <strong>{summary.evidence}</strong>
          <span>{t("handoff.evidenceDetail")}</span>
        </div>
      </div>
      <p className="handoff-scope-boundary">{t("handoff.scopeAgentSafeBoundary")}</p>
    </Section>
  );
}

function buildHandoffScopeSummary(
  pack: HandoffPack,
  t: ReturnType<typeof useI18n>["t"],
  formatDate: ReturnType<typeof useI18n>["formatDate"]
): {
  kind: string;
  value: string;
  generatedAt: string;
  objective: string;
  included: number;
  includedDetail: string;
  excluded: number;
  evidence: number;
} {
  const included =
    pack.recentActivity.length +
    pack.confirmedKnowledge.length +
    pack.activeMemories.length +
    pack.recommendedNextActions.length;
  const scopeValue =
    pack.kind === "project" ? (pack.project ?? t("fallback.none")) : formatDate(pack.date ?? "");

  return {
    kind: pack.kind === "project" ? t("handoff.project") : t("handoff.today"),
    value: `${t("handoff.scopeValue")}: ${scopeValue}`,
    generatedAt: formatHandoffGeneratedAt(pack.generatedAt),
    objective: formatObjectiveForDisplay(pack.objective),
    included,
    includedDetail: [
      `${t("handoff.includedRecentActivity")}: ${pack.recentActivity.length}`,
      `${t("handoff.includedConfirmedKnowledge")}: ${pack.confirmedKnowledge.length}`,
      `${t("handoff.includedActiveMemory")}: ${pack.activeMemories.length}`,
      `${t("handoff.includedRecommendations")}: ${pack.recommendedNextActions.length}`
    ].join(" · "),
    excluded: pack.excluded.length,
    evidence: pack.evidenceIndex.length
  };
}

function formatHandoffGeneratedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
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
