import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { Memory, MemoryKind } from "@orbit/core";
import type { MemoryEditInput, MemoryReviewAction } from "@orbit/db";
import type { DesktopMemoryDetail, DesktopMemorySearchFilters } from "../orbitApi";
import { EvidenceList } from "../components/EvidenceList";
import { MetricCard } from "../components/MetricCard";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";

type MemoryGroupBy = "kind" | "project" | "status" | "source" | "tag";

interface MemoryPageProps {
  memories: Memory[];
  focusMemoryId?: string | undefined;
  onFocusConsumed(): void;
  onDeleteMemory(id: string): Promise<void>;
  onEditMemory(id: string, patch: MemoryEditInput): Promise<void>;
  onRollbackMemoryVersion(id: string): Promise<void>;
  onReviewMemory(id: string, action: MemoryReviewAction): Promise<void>;
}

interface MemoryFilters {
  status: string;
  kind: string;
  project: string;
  sourceKind: string;
  tag: string;
}

interface MemoryEditForm {
  title: string;
  body: string;
  tags: string;
}

const defaultFilters: MemoryFilters = {
  status: "",
  kind: "",
  project: "",
  sourceKind: "",
  tag: ""
};

export function MemoryPage({
  memories,
  focusMemoryId,
  onFocusConsumed,
  onDeleteMemory,
  onEditMemory,
  onRollbackMemoryVersion,
  onReviewMemory
}: MemoryPageProps): ReactElement {
  const { t, status, memoryKind, sourceKind } = useI18n();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<MemoryFilters>(defaultFilters);
  const [groupBy, setGroupBy] = useState<MemoryGroupBy>("kind");
  const [results, setResults] = useState<Memory[]>(memories);
  const [selectedId, setSelectedId] = useState<string | undefined>(memories[0]?.id);
  const [detail, setDetail] = useState<DesktopMemoryDetail | undefined>();
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<MemoryEditForm | undefined>();
  const [refreshToken, setRefreshToken] = useState(0);

  const filterOptions = useMemo(() => buildFilterOptions(memories), [memories]);
  const stats = useMemo(() => buildMemoryStats(memories), [memories]);
  const groupedResults = useMemo(
    () => groupMemories(results, groupBy, t, memoryKind, sourceKind),
    [groupBy, memoryKind, results, sourceKind, t]
  );
  const selectedMemory = results.find((memory) => memory.id === selectedId);
  const activeMemory = detail?.memory ?? selectedMemory;
  const changedFields = activeMemory && editForm ? getChangedFields(activeMemory, editForm) : [];

  useEffect(() => {
    let cancelled = false;
    setIsLoadingResults(true);
    setError(undefined);
    void window.orbit
      .searchMemory(query, toSearchFilters(filters))
      .then((nextResults) => {
        if (!cancelled) {
          setResults(nextResults);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setResults(filterMemories(memories, query, filters));
          setError(reason instanceof Error ? reason.message : t("error.memorySearch"));
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
  }, [filters, memories, query, t]);

  useEffect(() => {
    if (results.some((memory) => memory.id === selectedId)) return;
    setSelectedId(results[0]?.id);
  }, [results, selectedId]);

  useEffect(() => {
    if (!focusMemoryId) return;
    if (!memories.some((memory) => memory.id === focusMemoryId)) return;
    setFilters(defaultFilters);
    setQuery("");
    setSelectedId(focusMemoryId);
    onFocusConsumed();
  }, [focusMemoryId, memories, onFocusConsumed]);

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
      .getMemoryDetail(selectedId)
      .then((nextDetail) => {
        if (!cancelled) {
          setDetail(nextDetail);
          setEditForm(toEditForm(nextDetail.memory));
          setCopied(false);
          setIsEditing(false);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setDetail(undefined);
          setError(reason instanceof Error ? reason.message : t("error.memoryDetail"));
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

  async function copyMemory(memory: Memory): Promise<void> {
    await navigator.clipboard.writeText(formatMemoryMarkdown(memory));
    setCopied(true);
  }

  async function saveEdit(memory: Memory): Promise<void> {
    if (!editForm || changedFields.length === 0) return;
    await onEditMemory(memory.id, toEditPatch(memory, editForm));
    setIsEditing(false);
    setRefreshToken((current) => current + 1);
  }

  async function reviewMemory(memory: Memory, action: MemoryReviewAction): Promise<void> {
    if (
      (action === "reject" && !window.confirm(t("confirm.rejectMemory"))) ||
      (action === "archive" && !window.confirm(t("confirm.archiveMemory")))
    ) {
      return;
    }
    await onReviewMemory(memory.id, action);
    setRefreshToken((current) => current + 1);
  }

  async function deleteMemory(memory: Memory): Promise<void> {
    if (!window.confirm(t("confirm.deleteMemory"))) return;
    await onDeleteMemory(memory.id);
    setSelectedId(undefined);
    setRefreshToken((current) => current + 1);
  }

  async function rollbackMemory(memory: Memory): Promise<void> {
    if (!window.confirm(t("confirm.rollbackMemoryVersion"))) return;
    await onRollbackMemoryVersion(memory.id);
    setRefreshToken((current) => current + 1);
  }

  return (
    <div className="page-grid">
      <div className="metrics-row">
        <MetricCard label={t("memory.metric.confirmed")} value={stats.confirmed} />
        <MetricCard label={t("memory.metric.needsReview")} value={stats.needsReview} />
        <MetricCard label={t("memory.metric.inactive")} value={stats.inactive} />
        <MetricCard label={t("memory.metric.ftsIndexed")} value={stats.ftsIndexed} />
      </div>

      <Section title={t("section.memoryStore")}>
        <div className="filter-bar memory-filter-bar">
          <label className="filter-search">
            <span>{t("filter.search")}</span>
            <input
              className="text-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("memory.searchPlaceholder")}
              type="search"
            />
          </label>
          <label>
            <span>{t("filter.groupBy")}</span>
            <select
              className="select-input compact-input"
              value={groupBy}
              onChange={(event) => setGroupBy(event.target.value as MemoryGroupBy)}
            >
              <option value="kind">{t("memory.group.kind")}</option>
              <option value="project">{t("memory.group.project")}</option>
              <option value="status">{t("memory.group.status")}</option>
              <option value="source">{t("memory.group.source")}</option>
              <option value="tag">{t("memory.group.tag")}</option>
            </select>
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
            <span>{t("filter.kind")}</span>
            <select
              className="select-input compact-input"
              value={filters.kind}
              onChange={(event) =>
                setFilters((current) => ({ ...current, kind: event.target.value }))
              }
            >
              <option value="">{t("filter.allKinds")}</option>
              {filterOptions.kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {memoryKind(kind)}
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
            <span>{t("filter.tag")}</span>
            <select
              className="select-input compact-input"
              value={filters.tag}
              onChange={(event) =>
                setFilters((current) => ({ ...current, tag: event.target.value }))
              }
            >
              <option value="">{t("filter.allTags")}</option>
              {filterOptions.tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <div className="error-banner inline">{error}</div> : null}

        <div className="memory-workbench">
          <div className="memory-list" aria-label={t("memory.memoryList")}>
            {isLoadingResults ? (
              <div className="empty-state compact">{t("memory.loadingSearch")}</div>
            ) : null}
            {groupedResults.map((group) => (
              <div className="memory-group" key={group.label}>
                <div className="memory-group-heading">
                  <span>{group.label}</span>
                  <small>{group.items.length}</small>
                </div>
                {group.items.map((memory) => (
                  <button
                    className={`memory-list-item ${selectedId === memory.id ? "active" : ""}`}
                    key={memory.id}
                    onClick={() => setSelectedId(memory.id)}
                    type="button"
                  >
                    <div className="item-heading">
                      <h3>{memory.title}</h3>
                      <span>{status(memory.status)}</span>
                    </div>
                    <p>{memory.body}</p>
                    <div className="meta-line">
                      <span>{memoryKind(memory.kind)}</span>
                      <span>{memory.scope.project ?? t("fallback.global")}</span>
                      <span>{formatConfidence(memory.confidence, t("memory.confidence"))}</span>
                    </div>
                    <div className="meta-line">
                      <span>
                        {memory.status === "confirmed"
                          ? t("memory.agentContextAllowed")
                          : t("memory.agentContextBlocked")}
                      </span>
                      <span>{memory.tags.join(", ") || t("fallback.none")}</span>
                    </div>
                  </button>
                ))}
              </div>
            ))}
            {results.length === 0 ? (
              <div className="empty-state">{t("empty.noMemories")}</div>
            ) : null}
          </div>

          <div className="memory-detail-pane">
            {activeMemory ? (
              <MemoryDetail
                changedFields={changedFields}
                copied={copied}
                detail={detail}
                editForm={editForm}
                isEditing={isEditing}
                isLoading={isLoadingDetail}
                memory={activeMemory}
                onCancelEdit={() => {
                  setEditForm(toEditForm(activeMemory));
                  setIsEditing(false);
                }}
                onCopyMemory={() => void copyMemory(activeMemory)}
                onDeleteMemory={() => void deleteMemory(activeMemory)}
                onEditFormChange={setEditForm}
                onRollbackMemoryVersion={() => void rollbackMemory(activeMemory)}
                onReview={(action) => void reviewMemory(activeMemory, action)}
                onSaveEdit={() => void saveEdit(activeMemory)}
                onStartEdit={() => setIsEditing(true)}
              />
            ) : (
              <div className="empty-state">{t("empty.noMemories")}</div>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}

function MemoryDetail({
  changedFields,
  copied,
  detail,
  editForm,
  isEditing,
  isLoading,
  memory,
  onCancelEdit,
  onCopyMemory,
  onDeleteMemory,
  onEditFormChange,
  onRollbackMemoryVersion,
  onReview,
  onSaveEdit,
  onStartEdit
}: {
  changedFields: string[];
  copied: boolean;
  detail: DesktopMemoryDetail | undefined;
  editForm: MemoryEditForm | undefined;
  isEditing: boolean;
  isLoading: boolean;
  memory: Memory;
  onCancelEdit(): void;
  onCopyMemory(): void;
  onDeleteMemory(): void;
  onEditFormChange(next: MemoryEditForm): void;
  onRollbackMemoryVersion(): void;
  onReview(action: MemoryReviewAction): void;
  onSaveEdit(): void;
  onStartEdit(): void;
}): ReactElement {
  const { t, status, memoryKind, sourceKind, formatDateTimeRange } = useI18n();
  const sourceKinds = Array.from(
    new Set([...(memory.scope.sourceKinds ?? []), ...memory.evidence.map((ref) => ref.sourceKind)])
  );

  return (
    <div className="detail-stack">
      <div className="detail-header">
        <div>
          <p className="eyebrow">{t("memory.governanceLayer")}</p>
          <h2>{memory.title}</h2>
          <p>
            {memoryKind(memory.kind)} · {status(memory.status)} ·{" "}
            {formatConfidence(memory.confidence, t("memory.confidence"))}
          </p>
        </div>
        <div className="action-row">
          <button className="secondary-button" onClick={onCopyMemory} type="button">
            {copied ? t("memory.copied") : t("memory.copyMarkdown")}
          </button>
          <button className="secondary-button" onClick={onStartEdit} type="button">
            {t("action.edit")}
          </button>
          <button
            className="secondary-button"
            disabled={memory.status === "confirmed"}
            onClick={() => onReview("confirm")}
            type="button"
          >
            {t("action.confirm")}
          </button>
          <button
            className="secondary-button"
            disabled={memory.status === "rejected"}
            onClick={() => onReview("reject")}
            type="button"
          >
            {t("action.reject")}
          </button>
          <button
            className="secondary-button"
            disabled={memory.status === "archived"}
            onClick={() => onReview("archive")}
            type="button"
          >
            {t("action.archive")}
          </button>
          <button
            className="secondary-button"
            data-memory-action="rollback-version"
            disabled={memory.version <= 1}
            onClick={onRollbackMemoryVersion}
            type="button"
          >
            {t("action.rollback")}
          </button>
          <button
            className="secondary-button danger-button"
            data-memory-action="delete"
            onClick={onDeleteMemory}
            type="button"
          >
            {t("action.delete")}
          </button>
        </div>
      </div>

      {isLoading ? <div className="empty-state compact">{t("memory.loadingDetail")}</div> : null}

      <dl className="detail-grid">
        <DetailField label={t("memory.dimension")} value={memory.dimension} />
        <DetailField label={t("memory.version")} value={`${memory.version}`} />
        <DetailField label={t("memory.scope")} value={formatScope(memory, t)} />
        <DetailField
          label={t("memory.tags")}
          value={memory.tags.join(", ") || t("fallback.none")}
        />
        <DetailField
          label={t("memory.sourceSessionIds")}
          value={memory.sourceSessionIds.join(", ") || t("fallback.none")}
        />
        <DetailField label={t("memory.createdAt")} value={formatDateTime(memory.createdAt)} />
        <DetailField label={t("memory.updatedAt")} value={formatDateTime(memory.updatedAt)} />
        <DetailField label={t("memory.validFrom")} value={memory.validFrom ?? t("fallback.none")} />
        <DetailField
          label={t("memory.validUntil")}
          value={memory.validUntil ?? t("fallback.none")}
        />
        <DetailField
          label={t("memory.lastReviewedAt")}
          value={memory.lastReviewedAt ?? t("fallback.none")}
        />
        <DetailField
          label={t("memory.supersedes")}
          value={memory.supersedes?.join(", ") ?? t("fallback.none")}
        />
      </dl>

      {isEditing && editForm ? (
        <MemoryEditPanel
          changedFields={changedFields}
          form={editForm}
          memory={memory}
          onCancel={onCancelEdit}
          onChange={onEditFormChange}
          onSave={onSaveEdit}
        />
      ) : null}

      <DetailBlock title={t("memory.body")}>
        <p>{memory.body}</p>
      </DetailBlock>

      <DetailBlock title={t("memory.memoryPoints")}>
        <TextList items={splitMemoryPoints(memory.body)} empty={t("fallback.none")} />
      </DetailBlock>

      <DetailBlock title={t("memory.evidence")}>
        <EvidenceList evidence={memory.evidence} limit={12} />
      </DetailBlock>

      <div className="detail-columns">
        <DetailBlock title={t("memory.sourceKnowledge")}>
          {detail?.sourceKnowledge.length ? (
            <div className="linked-object-list">
              {detail.sourceKnowledge.map((artifact) => (
                <article key={artifact.id}>
                  <h4>{artifact.title}</h4>
                  <p>
                    {artifact.type} · {artifact.status}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">{t("fallback.none")}</p>
          )}
        </DetailBlock>
        <DetailBlock title={t("memory.sourceSessions")}>
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
      </div>

      <div className="detail-columns">
        <DetailBlock title={t("memory.agentContextPolicy")}>
          <dl className="mini-grid">
            <DetailField
              label={t("memory.defaultContext")}
              value={
                memory.status === "confirmed"
                  ? t("memory.agentContextAllowed")
                  : t("memory.agentContextBlocked")
              }
            />
            <DetailField label={t("memory.contextScope")} value={formatScope(memory, t)} />
            <DetailField
              label={t("memory.expiration")}
              value={memory.validUntil ?? t("memory.noExpiration")}
            />
            <DetailField
              label={t("memory.reviewRequired")}
              value={memory.status === "needs_review" ? t("state.yes") : t("state.no")}
            />
          </dl>
        </DetailBlock>
        <DetailBlock title={t("memory.indexState")}>
          <dl className="mini-grid">
            <DetailField label={t("memory.reindexStatus")} value={memory.indexState.status} />
            <DetailField
              label={t("memory.ftsIndexed")}
              value={memory.indexState.provider === "fts" ? t("state.yes") : t("state.no")}
            />
            <DetailField label={t("memory.vectorIndexed")} value={t("state.disabled")} />
            <DetailField label={t("memory.indexProvider")} value={memory.indexState.provider} />
            <DetailField
              label={t("memory.embeddingProvider")}
              value={memory.indexState.fallbackOrder.join(" -> ")}
            />
          </dl>
        </DetailBlock>
      </div>

      <DetailBlock title={t("memory.privacyStatus")}>
        <div className="meta-line">
          {sourceKinds.map((kind) => (
            <span className="runtime-pill" key={kind}>
              {sourceKind(kind)}
            </span>
          ))}
          <span className="runtime-pill">{t("memory.evidencePreserved")}</span>
          <span className="runtime-pill">{t("memory.localOnly")}</span>
        </div>
      </DetailBlock>
    </div>
  );
}

function MemoryEditPanel({
  changedFields,
  form,
  memory,
  onCancel,
  onChange,
  onSave
}: {
  changedFields: string[];
  form: MemoryEditForm;
  memory: Memory;
  onCancel(): void;
  onChange(next: MemoryEditForm): void;
  onSave(): void;
}): ReactElement {
  const { t } = useI18n();
  return (
    <section className="detail-block edit-panel">
      <h3>{t("memory.editTitle")}</h3>
      <label>
        <span>{t("memory.title")}</span>
        <input
          className="text-input"
          value={form.title}
          onChange={(event) => onChange({ ...form, title: event.target.value })}
        />
      </label>
      <label>
        <span>{t("memory.body")}</span>
        <textarea
          className="text-area tall"
          value={form.body}
          onChange={(event) => onChange({ ...form, body: event.target.value })}
        />
      </label>
      <label>
        <span>{t("memory.tags")}</span>
        <input
          className="text-input"
          value={form.tags}
          onChange={(event) => onChange({ ...form, tags: event.target.value })}
        />
      </label>
      <div className="meta-line">
        <span>
          {changedFields.length
            ? `${t("memory.changedFields")}: ${changedFields
                .map((field) => memoryFieldLabel(field, t))
                .join(", ")}`
            : t("memory.noChangedFields")}
        </span>
        <span>
          {memory.evidence.length} {t("memory.evidenceCountLabel")}
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

function buildFilterOptions(memories: Memory[]): {
  statuses: string[];
  kinds: MemoryKind[];
  projects: string[];
  sourceKinds: string[];
  tags: string[];
} {
  return {
    statuses: sortedUnique(memories.map((memory) => memory.status)),
    kinds: sortedUnique(memories.map((memory) => memory.kind)),
    projects: sortedUnique(memories.map((memory) => memory.scope.project).filter(Boolean)),
    sourceKinds: sortedUnique(
      memories.flatMap((memory) => [
        ...(memory.scope.sourceKinds ?? []),
        ...memory.evidence.map((ref) => ref.sourceKind)
      ])
    ),
    tags: sortedUnique(memories.flatMap((memory) => memory.tags))
  };
}

function buildMemoryStats(memories: Memory[]): {
  confirmed: number;
  needsReview: number;
  inactive: number;
  ftsIndexed: number;
} {
  return {
    confirmed: memories.filter((memory) => memory.status === "confirmed").length,
    needsReview: memories.filter((memory) => memory.status === "needs_review").length,
    inactive: memories.filter(
      (memory) => memory.status === "archived" || memory.status === "rejected"
    ).length,
    ftsIndexed: memories.length
  };
}

function groupMemories(
  memories: Memory[],
  groupBy: MemoryGroupBy,
  t: ReturnType<typeof useI18n>["t"],
  memoryKind: ReturnType<typeof useI18n>["memoryKind"],
  sourceKind: ReturnType<typeof useI18n>["sourceKind"]
): Array<{ label: string; items: Memory[] }> {
  const groups = new Map<string, Memory[]>();
  for (const memory of memories) {
    const keys = groupKeys(memory, groupBy, t, memoryKind, sourceKind);
    for (const key of keys) {
      groups.set(key, [...(groups.get(key) ?? []), memory]);
    }
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, items]) => ({ label, items }));
}

function groupKeys(
  memory: Memory,
  groupBy: MemoryGroupBy,
  t: ReturnType<typeof useI18n>["t"],
  memoryKind: ReturnType<typeof useI18n>["memoryKind"],
  sourceKind: ReturnType<typeof useI18n>["sourceKind"]
): string[] {
  if (groupBy === "kind") return [memoryKind(memory.kind)];
  if (groupBy === "project") return [memory.scope.project ?? t("fallback.global")];
  if (groupBy === "status") return [memory.status];
  if (groupBy === "tag") return memory.tags.length ? memory.tags : [t("fallback.none")];
  const sourceKinds = Array.from(
    new Set([...(memory.scope.sourceKinds ?? []), ...memory.evidence.map((ref) => ref.sourceKind)])
  );
  return sourceKinds.length ? sourceKinds.map(sourceKind) : [t("fallback.none")];
}

function toSearchFilters(filters: MemoryFilters): DesktopMemorySearchFilters {
  return {
    status: filters.status ? (filters.status as Memory["status"]) : undefined,
    kind: filters.kind ? (filters.kind as MemoryKind) : undefined,
    project: filters.project || undefined,
    sourceKind: filters.sourceKind || undefined,
    tag: filters.tag || undefined
  };
}

function filterMemories(memories: Memory[], query: string, filters: MemoryFilters): Memory[] {
  const loweredQuery = query.trim().toLowerCase();
  return memories.filter((memory) => {
    if (filters.status && memory.status !== filters.status) return false;
    if (filters.kind && memory.kind !== filters.kind) return false;
    if (filters.project && memory.scope.project !== filters.project) return false;
    if (
      filters.sourceKind &&
      !memory.scope.sourceKinds?.some((kind) => kind === filters.sourceKind) &&
      !memory.evidence.some((ref) => ref.sourceKind === filters.sourceKind)
    ) {
      return false;
    }
    if (filters.tag && !memory.tags.includes(filters.tag)) return false;
    if (!loweredQuery) return true;
    return [
      memory.title,
      memory.body,
      memory.kind,
      memory.status,
      memory.scope.project,
      memory.tags.join(" "),
      memory.evidence.map((ref) => `${ref.sourcePointer} ${ref.excerpt ?? ""}`).join(" ")
    ]
      .join(" ")
      .toLowerCase()
      .includes(loweredQuery);
  });
}

function toEditForm(memory: Memory): MemoryEditForm {
  return {
    title: memory.title,
    body: memory.body,
    tags: memory.tags.join(", ")
  };
}

function toEditPatch(memory: Memory, form: MemoryEditForm): MemoryEditInput {
  const tags = splitTags(form.tags);
  return {
    title: form.title !== memory.title ? form.title : undefined,
    body: form.body !== memory.body ? form.body : undefined,
    tags: !stringArraysEqual(tags, memory.tags) ? tags : undefined
  };
}

function getChangedFields(memory: Memory, form: MemoryEditForm): string[] {
  const patch = toEditPatch(memory, form);
  return Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
}

function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitMemoryPoints(body: string): string[] {
  const lines = body
    .split("\n")
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
  return lines.length > 1 ? lines : [body].filter(Boolean);
}

function stringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function formatMemoryMarkdown(memory: Memory): string {
  const lines = [
    `# ${memory.title}`,
    "",
    `- kind: ${memory.kind}`,
    `- dimension: ${memory.dimension}`,
    `- status: ${memory.status}`,
    `- version: ${memory.version}`,
    `- scope: ${memory.scope.project ?? (memory.scope.global ? "global" : "unspecified")}`,
    `- source sessions: ${memory.sourceSessionIds.join(", ") || "none"}`,
    `- tags: ${memory.tags.join(", ") || "none"}`,
    "",
    memory.body
  ];
  return lines.join("\n");
}

function formatScope(memory: Memory, t: ReturnType<typeof useI18n>["t"]): string {
  if (memory.scope.project) return memory.scope.project;
  if (memory.scope.global) return t("fallback.global");
  return t("fallback.none");
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

function formatConfidence(confidence: number, label: string): string {
  return `${label} ${Math.round(confidence * 100)}%`;
}

function memoryFieldLabel(field: string, t: ReturnType<typeof useI18n>["t"]): string {
  if (field === "title") return t("memory.field.title");
  if (field === "body") return t("memory.field.body");
  if (field === "tags") return t("memory.field.tags");
  return field;
}

function sortedUnique<T extends string>(values: Array<T | undefined>): T[] {
  return Array.from(new Set(values.filter(Boolean) as T[])).sort((a, b) => a.localeCompare(b));
}
