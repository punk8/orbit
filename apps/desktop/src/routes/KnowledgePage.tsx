import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { KnowledgeArtifact, KnowledgeArtifactType } from "@orbit/core";
import type { KnowledgeEditInput, KnowledgeReviewAction } from "@orbit/db";
import type { DesktopKnowledgeArtifactDetail, DesktopKnowledgeSearchFilters } from "../orbitApi";
import { EvidenceList } from "../components/EvidenceList";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";

interface KnowledgePageProps {
  artifacts: KnowledgeArtifact[];
  focusArtifactId?: string | undefined;
  onFocusConsumed(): void;
  onDeleteKnowledge(id: string): Promise<void>;
  onEditKnowledge(id: string, patch: KnowledgeEditInput): Promise<void>;
  onRegenerateKnowledge(id: string): Promise<void>;
  onReviewKnowledge(id: string, action: KnowledgeReviewAction): Promise<void>;
  onTranslateKnowledge(id: string, language: "en" | "zh-CN"): Promise<void>;
}

interface KnowledgeFilters {
  status: string;
  type: string;
  project: string;
  sourceKind: string;
  dateFrom: string;
  dateTo: string;
}

interface KnowledgeEditForm {
  title: string;
  description: string;
  keyInsights: string;
  markdown: string;
}

const defaultFilters: KnowledgeFilters = {
  status: "",
  type: "",
  project: "",
  sourceKind: "",
  dateFrom: "",
  dateTo: ""
};

export function KnowledgePage({
  artifacts,
  focusArtifactId,
  onFocusConsumed,
  onDeleteKnowledge,
  onEditKnowledge,
  onRegenerateKnowledge,
  onReviewKnowledge,
  onTranslateKnowledge
}: KnowledgePageProps): ReactElement {
  const { t, status, sourceKind, formatDateTimeRange } = useI18n();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<KnowledgeFilters>(defaultFilters);
  const [results, setResults] = useState<KnowledgeArtifact[]>(artifacts);
  const [selectedId, setSelectedId] = useState<string | undefined>(artifacts[0]?.id);
  const [detail, setDetail] = useState<DesktopKnowledgeArtifactDetail | undefined>();
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<KnowledgeEditForm | undefined>();
  const [refreshToken, setRefreshToken] = useState(0);

  const filterOptions = useMemo(() => buildFilterOptions(artifacts), [artifacts]);
  const selectedArtifact = results.find((artifact) => artifact.id === selectedId);
  const activeArtifact = detail?.artifact ?? selectedArtifact;
  const changedFields =
    activeArtifact && editForm ? getChangedFields(activeArtifact, editForm) : [];

  useEffect(() => {
    let cancelled = false;
    setIsLoadingResults(true);
    setError(undefined);
    void window.orbit
      .searchKnowledge(query, toSearchFilters(filters))
      .then((nextResults) => {
        if (!cancelled) {
          setResults(nextResults);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setResults(filterArtifacts(artifacts, query, filters));
          setError(reason instanceof Error ? reason.message : t("error.knowledgeSearch"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingResults(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [artifacts, filters, query, t]);

  useEffect(() => {
    if (results.some((artifact) => artifact.id === selectedId)) return;
    setSelectedId(results[0]?.id);
  }, [results, selectedId]);

  useEffect(() => {
    if (!focusArtifactId) return;
    if (!artifacts.some((artifact) => artifact.id === focusArtifactId)) return;
    setFilters(defaultFilters);
    setQuery("");
    setSelectedId(focusArtifactId);
    onFocusConsumed();
  }, [artifacts, focusArtifactId, onFocusConsumed]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(undefined);
      setEditForm(undefined);
      setIsEditing(false);
      return;
    }

    let cancelled = false;
    setIsLoadingDetail(true);
    setError(undefined);
    void window.orbit
      .getKnowledgeArtifactDetail(selectedId)
      .then((nextDetail) => {
        if (!cancelled) {
          setDetail(nextDetail);
          setEditForm(toEditForm(nextDetail.artifact));
          setCopied(false);
          setIsEditing(false);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setDetail(undefined);
          setError(reason instanceof Error ? reason.message : t("error.knowledgeDetail"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingDetail(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, refreshToken, t]);

  async function copyMarkdown(artifact: KnowledgeArtifact): Promise<void> {
    await navigator.clipboard.writeText(artifact.content.markdown);
    setCopied(true);
  }

  async function saveEdit(artifact: KnowledgeArtifact): Promise<void> {
    if (!editForm || changedFields.length === 0) return;
    await onEditKnowledge(artifact.id, toEditPatch(artifact, editForm));
    setIsEditing(false);
    setRefreshToken((current) => current + 1);
  }

  async function reviewArtifact(
    artifact: KnowledgeArtifact,
    action: KnowledgeReviewAction
  ): Promise<void> {
    if (
      (action === "reject" && !window.confirm(t("confirm.rejectKnowledge"))) ||
      (action === "archive" && !window.confirm(t("confirm.archiveKnowledge")))
    ) {
      return;
    }
    await onReviewKnowledge(artifact.id, action);
    setRefreshToken((current) => current + 1);
  }

  async function regenerateArtifact(artifact: KnowledgeArtifact): Promise<void> {
    await onRegenerateKnowledge(artifact.id);
    setRefreshToken((current) => current + 1);
  }

  async function translateArtifact(
    artifact: KnowledgeArtifact,
    language: "en" | "zh-CN"
  ): Promise<void> {
    await onTranslateKnowledge(artifact.id, language);
    setRefreshToken((current) => current + 1);
  }

  async function deleteArtifact(artifact: KnowledgeArtifact): Promise<void> {
    if (!window.confirm(t("confirm.deleteKnowledge"))) return;
    await onDeleteKnowledge(artifact.id);
    setSelectedId(undefined);
    setRefreshToken((current) => current + 1);
  }

  return (
    <div className="page-grid">
      <Section title={t("section.knowledgeArtifacts")}>
        <div className="filter-bar knowledge-filter-bar">
          <label className="filter-search">
            <span>{t("filter.search")}</span>
            <input
              className="text-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("knowledge.searchPlaceholder")}
              type="search"
            />
          </label>
          <label>
            <span>{t("filter.status")}</span>
            <select
              className="select-input compact-input"
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({ ...current, status: event.target.value }))
              }
            >
              <option value="">{t("filter.allStatuses")}</option>
              {filterOptions.statuses.map((value) => (
                <option key={value} value={value}>
                  {status(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("filter.type")}</span>
            <select
              className="select-input compact-input"
              value={filters.type}
              onChange={(event) =>
                setFilters((current) => ({ ...current, type: event.target.value }))
              }
            >
              <option value="">{t("filter.allTypes")}</option>
              {filterOptions.types.map((value) => (
                <option key={value} value={value}>
                  {knowledgeTypeLabel(value, t)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("filter.project")}</span>
            <select
              className="select-input compact-input"
              value={filters.project}
              onChange={(event) =>
                setFilters((current) => ({ ...current, project: event.target.value }))
              }
            >
              <option value="">{t("filter.allProjects")}</option>
              {filterOptions.projects.map((project) => (
                <option key={project} value={project}>
                  {project}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("filter.source")}</span>
            <select
              className="select-input compact-input"
              value={filters.sourceKind}
              onChange={(event) =>
                setFilters((current) => ({ ...current, sourceKind: event.target.value }))
              }
            >
              <option value="">{t("filter.allSources")}</option>
              {filterOptions.sourceKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {sourceKind(kind)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("filter.from")}</span>
            <input
              className="text-input compact-input"
              type="date"
              value={filters.dateFrom}
              onChange={(event) =>
                setFilters((current) => ({ ...current, dateFrom: event.target.value }))
              }
            />
          </label>
          <label>
            <span>{t("filter.to")}</span>
            <input
              className="text-input compact-input"
              type="date"
              value={filters.dateTo}
              onChange={(event) =>
                setFilters((current) => ({ ...current, dateTo: event.target.value }))
              }
            />
          </label>
        </div>

        {error ? <div className="error-banner inline">{error}</div> : null}

        <div className="knowledge-workbench">
          <div className="knowledge-list" aria-label={t("knowledge.artifactList")}>
            {isLoadingResults ? (
              <div className="empty-state compact">{t("knowledge.loadingSearch")}</div>
            ) : null}
            {results.map((artifact) => (
              <button
                className={`knowledge-list-item ${selectedId === artifact.id ? "active" : ""}`}
                key={artifact.id}
                onClick={() => setSelectedId(artifact.id)}
                type="button"
              >
                <div className="item-heading">
                  <h3>{artifact.title}</h3>
                  <span>{status(artifact.status)}</span>
                </div>
                <p>{artifact.content.description}</p>
                <div className="meta-line">
                  <span>{knowledgeTypeLabel(artifact.type, t)}</span>
                  <span>{formatArtifactWindow(artifact, formatDateTimeRange)}</span>
                  <span>
                    {artifact.metadata.sourceSessionIds.length} {t("knowledge.sourceSessionsShort")}
                  </span>
                </div>
                <div className="meta-line">
                  <span>{formatConfidence(artifact.confidence, t("knowledge.confidence"))}</span>
                  <span>{formatProjects(artifact.metadata.projects, t("fallback.global"))}</span>
                </div>
              </button>
            ))}
            {results.length === 0 ? (
              <div className="empty-state">{t("empty.noKnowledgeArtifacts")}</div>
            ) : null}
          </div>

          <div className="knowledge-detail-pane">
            {activeArtifact ? (
              <KnowledgeDetail
                artifact={activeArtifact}
                copied={copied}
                detail={detail}
                editForm={editForm}
                isEditing={isEditing}
                isLoading={isLoadingDetail}
                changedFields={changedFields}
                onCancelEdit={() => {
                  setEditForm(toEditForm(activeArtifact));
                  setIsEditing(false);
                }}
                onCopyMarkdown={() => void copyMarkdown(activeArtifact)}
                onEditFormChange={setEditForm}
                onDelete={() => void deleteArtifact(activeArtifact)}
                onRegenerate={() => void regenerateArtifact(activeArtifact)}
                onReview={(action) => void reviewArtifact(activeArtifact, action)}
                onSaveEdit={() => void saveEdit(activeArtifact)}
                onStartEdit={() => setIsEditing(true)}
                onTranslate={(language) => void translateArtifact(activeArtifact, language)}
              />
            ) : (
              <div className="empty-state">{t("empty.noKnowledgeArtifacts")}</div>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}

function KnowledgeDetail({
  artifact,
  copied,
  detail,
  editForm,
  isEditing,
  isLoading,
  changedFields,
  onCancelEdit,
  onCopyMarkdown,
  onDelete,
  onEditFormChange,
  onRegenerate,
  onReview,
  onSaveEdit,
  onStartEdit,
  onTranslate
}: {
  artifact: KnowledgeArtifact;
  copied: boolean;
  detail: DesktopKnowledgeArtifactDetail | undefined;
  editForm: KnowledgeEditForm | undefined;
  isEditing: boolean;
  isLoading: boolean;
  changedFields: string[];
  onCancelEdit(): void;
  onCopyMarkdown(): void;
  onDelete(): void;
  onEditFormChange(next: KnowledgeEditForm): void;
  onRegenerate(): void;
  onReview(action: KnowledgeReviewAction): void;
  onSaveEdit(): void;
  onStartEdit(): void;
  onTranslate(language: "en" | "zh-CN"): void;
}): ReactElement {
  const { t, status, sourceKind, formatDateTimeRange } = useI18n();

  return (
    <div className="detail-stack">
      <div className="detail-header">
        <div>
          <p className="eyebrow">{t("knowledge.reviewLayer")}</p>
          <h2>{artifact.title}</h2>
          <p>
            {knowledgeTypeLabel(artifact.type, t)} · {status(artifact.status)} ·{" "}
            {formatConfidence(artifact.confidence, t("knowledge.confidence"))}
          </p>
        </div>
        <div className="action-row">
          <button className="secondary-button" onClick={onCopyMarkdown} type="button">
            {copied ? t("knowledge.copied") : t("knowledge.copyMarkdown")}
          </button>
          <button className="secondary-button" onClick={onStartEdit} type="button">
            {t("action.edit")}
          </button>
          <button className="secondary-button" onClick={onRegenerate} type="button">
            {t("action.regenerate")}
          </button>
          <button className="secondary-button" onClick={() => onTranslate("zh-CN")} type="button">
            {t("action.translate")}
          </button>
          <button
            className="secondary-button"
            disabled={artifact.status === "confirmed"}
            onClick={() => onReview("confirm")}
            type="button"
          >
            {t("action.confirm")}
          </button>
          <button
            className="secondary-button"
            disabled={artifact.status === "rejected"}
            onClick={() => onReview("reject")}
            type="button"
          >
            {t("action.reject")}
          </button>
          <button
            className="secondary-button"
            disabled={artifact.status === "archived"}
            onClick={() => onReview("archive")}
            type="button"
          >
            {t("action.archive")}
          </button>
          <button className="secondary-button danger-button" onClick={onDelete} type="button">
            {t("action.delete")}
          </button>
        </div>
      </div>

      {isLoading ? <div className="empty-state compact">{t("knowledge.loadingDetail")}</div> : null}

      <dl className="detail-grid">
        <DetailField
          label={t("knowledge.timeWindow")}
          value={formatArtifactWindow(artifact, formatDateTimeRange)}
        />
        <DetailField
          label={t("knowledge.apps")}
          value={artifact.metadata.apps.join(", ") || t("fallback.unknownApp")}
        />
        <DetailField
          label={t("knowledge.projects")}
          value={formatProjects(artifact.metadata.projects, t("fallback.global"))}
        />
        <DetailField
          label={t("knowledge.generatedBy")}
          value={artifact.metadata.generatedBy ?? t("fallback.none")}
        />
        <DetailField
          label={t("knowledge.language")}
          value={artifact.metadata.language ?? t("fallback.none")}
        />
        <DetailField label={t("knowledge.createdAt")} value={formatDateTime(artifact.createdAt)} />
        <DetailField label={t("knowledge.updatedAt")} value={formatDateTime(artifact.updatedAt)} />
        <DetailField
          label={t("knowledge.sourceSessions")}
          value={`${artifact.metadata.sourceSessionIds.length}`}
        />
      </dl>

      {isEditing && editForm ? (
        <KnowledgeEditPanel
          artifact={artifact}
          changedFields={changedFields}
          form={editForm}
          onCancel={onCancelEdit}
          onChange={onEditFormChange}
          onSave={onSaveEdit}
        />
      ) : null}

      <DetailBlock title={t("knowledge.description")}>
        <p>{artifact.content.description || t("fallback.noSummary")}</p>
      </DetailBlock>

      <DetailBlock title={t("knowledge.keyInsights")}>
        <TextList items={artifact.content.keyInsights} empty={t("fallback.none")} />
      </DetailBlock>

      <div className="detail-columns">
        <DetailBlock title={t("knowledge.decisions")}>
          <TextList items={artifact.content.decisions ?? []} empty={t("fallback.none")} />
        </DetailBlock>
        <DetailBlock title={t("knowledge.openQuestions")}>
          <TextList items={artifact.content.openQuestions ?? []} empty={t("fallback.none")} />
        </DetailBlock>
      </div>

      <div className="detail-columns">
        <DetailBlock title={t("knowledge.blockers")}>
          <TextList items={artifact.content.blockers ?? []} empty={t("fallback.none")} />
        </DetailBlock>
        <DetailBlock title={t("knowledge.evidenceAvailability")}>
          <TextList items={evidenceAvailabilityLines(artifact)} empty={t("fallback.none")} />
        </DetailBlock>
      </div>

      <DetailBlock title={t("knowledge.followUps")}>
        {artifact.content.followUps?.length ? (
          <div className="event-stream">
            {artifact.content.followUps.map((followUp) => (
              <article className="event-row compact-event-row" key={followUp.id}>
                <div className="event-row-time">{followUp.status}</div>
                <div>
                  <h3>{followUp.title}</h3>
                  <div className="meta-line">
                    <span>{followUp.owner ?? t("fallback.none")}</span>
                    <span>{followUp.dueAt ?? t("fallback.none")}</span>
                  </div>
                  <EvidenceList evidence={followUp.evidence} limit={3} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">{t("fallback.none")}</p>
        )}
      </DetailBlock>

      <DetailBlock title={t("knowledge.markdownPreview")}>
        <pre className="markdown-preview">{artifact.content.markdown}</pre>
      </DetailBlock>

      <DetailBlock title={t("knowledge.evidence")}>
        <EvidenceList evidence={artifact.evidence} limit={12} />
      </DetailBlock>

      <div className="detail-columns">
        <DetailBlock title={t("knowledge.sourceSessions")}>
          {detail?.sourceSessions.length ? (
            <div className="linked-object-list">
              {detail.sourceSessions.map((session) => (
                <article key={session.id}>
                  <h4>{session.title}</h4>
                  <p>{formatDateTimeRange(session.startAt, session.endAt)}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">{t("fallback.none")}</p>
          )}
        </DetailBlock>
        <DetailBlock title={t("knowledge.relatedMemories")}>
          {detail?.relatedMemories.length ? (
            <div className="linked-object-list">
              {detail.relatedMemories.map((memory) => (
                <article key={memory.id}>
                  <h4>{memory.title}</h4>
                  <p>
                    {memory.status} · {memory.kind}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">{t("fallback.none")}</p>
          )}
        </DetailBlock>
      </div>

      <DetailBlock title={t("knowledge.providerMetadata")}>
        <dl className="mini-grid">
          <DetailField
            label={t("knowledge.providerTask")}
            value={t("knowledge.providerTaskDraft")}
          />
          <DetailField
            label={t("knowledge.providerKind")}
            value={artifact.metadata.generatedBy ?? t("provider.disabled")}
          />
          <DetailField
            label={t("knowledge.dataBoundary")}
            value={t("knowledge.dataBoundaryPolicy")}
          />
          <DetailField label={t("knowledge.evidenceCount")} value={`${artifact.evidence.length}`} />
        </dl>
      </DetailBlock>

      <DetailBlock title={t("knowledge.privacyStatus")}>
        <div className="meta-line">
          {Array.from(new Set(artifact.evidence.map((ref) => ref.sourceKind))).map((kind) => (
            <span key={kind} className="runtime-pill">
              {sourceKind(kind)}
            </span>
          ))}
          <span className="runtime-pill">{t("knowledge.evidencePreserved")}</span>
        </div>
      </DetailBlock>
    </div>
  );
}

function KnowledgeEditPanel({
  artifact,
  changedFields,
  form,
  onCancel,
  onChange,
  onSave
}: {
  artifact: KnowledgeArtifact;
  changedFields: string[];
  form: KnowledgeEditForm;
  onCancel(): void;
  onChange(next: KnowledgeEditForm): void;
  onSave(): void;
}): ReactElement {
  const { t } = useI18n();
  return (
    <section className="detail-block edit-panel">
      <h3>{t("knowledge.editTitle")}</h3>
      <div className="knowledge-edit-workbench">
        <div className="knowledge-edit-fields">
          <label>
            <span>{t("knowledge.title")}</span>
            <input
              className="text-input"
              value={form.title}
              onChange={(event) => onChange({ ...form, title: event.target.value })}
            />
          </label>
          <label>
            <span>{t("knowledge.description")}</span>
            <textarea
              className="text-area"
              value={form.description}
              onChange={(event) => onChange({ ...form, description: event.target.value })}
            />
          </label>
          <label>
            <span>{t("knowledge.keyInsights")}</span>
            <textarea
              className="text-area"
              value={form.keyInsights}
              onChange={(event) => onChange({ ...form, keyInsights: event.target.value })}
            />
          </label>
          <label>
            <span>{t("knowledge.markdown")}</span>
            <textarea
              className="text-area tall"
              value={form.markdown}
              onChange={(event) => onChange({ ...form, markdown: event.target.value })}
            />
          </label>
        </div>
        <div className="knowledge-edit-preview">
          <h4>{t("knowledge.editingMarkdownPreview")}</h4>
          <pre className="markdown-preview">{form.markdown}</pre>
          <h4>{t("knowledge.evidence")}</h4>
          <EvidenceList evidence={artifact.evidence} limit={8} />
        </div>
      </div>
      <div className="meta-line">
        <span>
          {changedFields.length
            ? `${t("knowledge.changedFields")}: ${changedFields
                .map((field) => knowledgeFieldLabel(field, t))
                .join(", ")}`
            : t("knowledge.noChangedFields")}
        </span>
        <span>
          {artifact.evidence.length} {t("knowledge.evidenceCountLabel")}
        </span>
      </div>
      <div className="action-row">
        <button
          className="secondary-button"
          disabled={changedFields.length === 0}
          onClick={onSave}
          type="button"
        >
          {t("action.save")}
        </button>
        <button className="secondary-button" onClick={onCancel} type="button">
          {t("action.cancel")}
        </button>
      </div>
    </section>
  );
}

function DetailBlock({
  title,
  children
}: {
  title: string;
  children: ReactElement | ReactElement[];
}): ReactElement {
  return (
    <section className="detail-block">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function DetailField({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function TextList({ items, empty }: { items: string[]; empty: string }): ReactElement {
  if (items.length === 0) {
    return <p className="muted">{empty}</p>;
  }
  return (
    <ul className="insight-list detail-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function buildFilterOptions(artifacts: KnowledgeArtifact[]): {
  statuses: string[];
  types: KnowledgeArtifactType[];
  projects: string[];
  sourceKinds: string[];
} {
  return {
    statuses: sortedUnique(artifacts.map((artifact) => artifact.status)),
    types: sortedUnique(artifacts.map((artifact) => artifact.type)),
    projects: sortedUnique(artifacts.flatMap((artifact) => artifact.metadata.projects)),
    sourceKinds: sortedUnique(
      artifacts.flatMap((artifact) => artifact.evidence.map((ref) => ref.sourceKind))
    )
  };
}

function toSearchFilters(filters: KnowledgeFilters): DesktopKnowledgeSearchFilters {
  return {
    status: filters.status ? (filters.status as KnowledgeArtifact["status"]) : undefined,
    type: filters.type ? (filters.type as KnowledgeArtifactType) : undefined,
    project: filters.project || undefined,
    sourceKind: filters.sourceKind || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined
  };
}

function filterArtifacts(
  artifacts: KnowledgeArtifact[],
  query: string,
  filters: KnowledgeFilters
): KnowledgeArtifact[] {
  const loweredQuery = query.trim().toLowerCase();
  return artifacts.filter((artifact) => {
    if (filters.status && artifact.status !== filters.status) return false;
    if (filters.type && artifact.type !== filters.type) return false;
    if (filters.project && !artifact.metadata.projects.includes(filters.project)) return false;
    if (
      filters.sourceKind &&
      !artifact.evidence.some((ref) => ref.sourceKind === filters.sourceKind)
    ) {
      return false;
    }
    const date = artifact.metadata.timeWindow?.startAt ?? artifact.createdAt;
    if (filters.dateFrom && date < `${filters.dateFrom}T00:00:00.000Z`) return false;
    if (filters.dateTo && date > `${filters.dateTo}T23:59:59.999Z`) return false;
    if (!loweredQuery) return true;
    return [
      artifact.title,
      artifact.content.description,
      artifact.content.markdown,
      artifact.content.keyInsights.join(" "),
      artifact.metadata.projects.join(" "),
      artifact.evidence.map((ref) => `${ref.sourcePointer} ${ref.excerpt ?? ""}`).join(" ")
    ]
      .join(" ")
      .toLowerCase()
      .includes(loweredQuery);
  });
}

function toEditForm(artifact: KnowledgeArtifact): KnowledgeEditForm {
  return {
    title: artifact.title,
    description: artifact.content.description,
    keyInsights: artifact.content.keyInsights.join("\n"),
    markdown: artifact.content.markdown
  };
}

function toEditPatch(artifact: KnowledgeArtifact, form: KnowledgeEditForm): KnowledgeEditInput {
  const keyInsights = splitLines(form.keyInsights);
  return {
    title: form.title !== artifact.title ? form.title : undefined,
    description: form.description !== artifact.content.description ? form.description : undefined,
    keyInsights: !stringArraysEqual(keyInsights, artifact.content.keyInsights)
      ? keyInsights
      : undefined,
    markdown: form.markdown !== artifact.content.markdown ? form.markdown : undefined
  };
}

function getChangedFields(artifact: KnowledgeArtifact, form: KnowledgeEditForm): string[] {
  const patch = toEditPatch(artifact, form);
  return Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function formatArtifactWindow(
  artifact: KnowledgeArtifact,
  formatDateTimeRange: (startAt: string, endAt: string) => string
): string {
  return artifact.metadata.timeWindow
    ? formatDateTimeRange(artifact.metadata.timeWindow.startAt, artifact.metadata.timeWindow.endAt)
    : formatDateTime(artifact.createdAt);
}

function formatDateTime(value: string): string {
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

function formatProjects(projects: string[], fallback: string): string {
  return projects.length > 0 ? projects.join(", ") : fallback;
}

function formatConfidence(confidence: number, label: string): string {
  return `${label} ${Math.round(confidence * 100)}%`;
}

function evidenceAvailabilityLines(artifact: KnowledgeArtifact): string[] {
  const unavailable = artifact.evidence.filter((ref) => ref.availability === "unavailable");
  const lines = [`${artifact.evidence.length - unavailable.length}/${artifact.evidence.length}`];
  if (artifact.metadata.evidenceState) lines.push(artifact.metadata.evidenceState);
  if (artifact.metadata.evidenceUnavailableReason) {
    lines.push(artifact.metadata.evidenceUnavailableReason);
  }
  return lines;
}

function knowledgeTypeLabel(
  type: KnowledgeArtifactType,
  t: ReturnType<typeof useI18n>["t"]
): string {
  return t(`knowledgeType.${type}`);
}

function knowledgeFieldLabel(field: string, t: ReturnType<typeof useI18n>["t"]): string {
  if (field === "title") return t("knowledge.field.title");
  if (field === "description") return t("knowledge.field.description");
  if (field === "keyInsights") return t("knowledge.field.keyInsights");
  if (field === "markdown") return t("knowledge.field.markdown");
  return field;
}

function sortedUnique<T extends string>(values: Array<T | undefined>): T[] {
  return Array.from(new Set(values.filter(Boolean) as T[])).sort((a, b) => a.localeCompare(b));
}
