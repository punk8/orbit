import { useState } from "react";
import type { ReactElement } from "react";
import type { DesktopHandoffResult, DesktopSnapshot } from "../orbitApi";
import type { HandoffExclusionReason } from "@orbit/core";
import { MetricCard } from "../components/MetricCard";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";

export function HandoffPage({
  snapshot,
  onGenerateHandoff
}: {
  snapshot: DesktopSnapshot;
  onGenerateHandoff(
    input: { kind: "today"; date?: string } | { kind: "project"; project: string }
  ): Promise<DesktopHandoffResult>;
}): ReactElement {
  const { t } = useI18n();
  const [project, setProject] = useState("orbit");
  const [result, setResult] = useState<DesktopHandoffResult | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

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
          label={t("handoff.evidence")}
          value={result?.handoff.evidenceIndex.length ?? 0}
        />
        <MetricCard
          label={t("section.recentActivity")}
          value={result?.handoff.recentActivity.length ?? snapshot.today.activitySessions.length}
        />
        <MetricCard
          label={t("section.knowledgeArtifacts")}
          value={result?.handoff.confirmedKnowledge.length ?? 0}
        />
        <MetricCard
          label={t("section.memoryStore")}
          value={result?.handoff.activeMemories.length ?? 0}
        />
      </div>

      <Section title={t("handoff.generate")}>
        <div className="handoff-controls">
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
              onChange={(event) => setProject(event.currentTarget.value)}
              value={project}
            />
            <button
              className="secondary-button"
              data-handoff-action="generate-project"
              disabled={isGenerating || project.trim().length === 0}
              onClick={() => void generate({ kind: "project", project: project.trim() })}
              type="button"
            >
              {t("handoff.project")}
            </button>
          </div>
        </div>
      </Section>

      {error ? <div className="error-banner">{`${t("handoff.error")}: ${error}`}</div> : null}

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
            <button className="secondary-button" onClick={() => void copyMarkdown()} type="button">
              {copied ? t("handoff.copied") : t("handoff.copyMarkdown")}
            </button>
          ) : null
        }
      >
        {result ? (
          <pre className="handoff-preview">{result.markdown}</pre>
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
                <article className="list-item vertical" key={evidence.id}>
                  <h3>{evidence.sourceKind}</h3>
                  <p>{evidence.sourcePointer}</p>
                </article>
              ))}
            </div>
          </Section>
        </div>
      ) : null}
    </div>
  );
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
  return t("handoff.exclusion.nextAction.allowExport");
}
