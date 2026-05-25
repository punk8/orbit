import { useState } from "react";
import type { ReactElement } from "react";
import type {
  DesktopSnapshot,
  DesktopSourceImportPreview,
  DesktopSourceRuntimeAction,
  SourceSetupKind
} from "../orbitApi";
import type { PerceptionSourceRuntimeAction } from "@orbit/core";
import { MetricCard } from "../components/MetricCard";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";

export function SourcesPage({
  snapshot,
  onSetupSource,
  onPreviewSourceImport,
  onConfirmSourceImport,
  onReconfigureSource,
  onDeleteSource,
  onResetSourceCursor,
  onCleanupLegacyEventPrivacy,
  onCleanupPerceptionSidecars,
  onUpdateSourceRuntime,
  onUpdatePerceptionSourceRuntime
}: {
  snapshot: DesktopSnapshot;
  onSetupSource(kind: SourceSetupKind, path?: string): Promise<void>;
  onPreviewSourceImport(kind: SourceSetupKind, path: string): Promise<DesktopSourceImportPreview>;
  onConfirmSourceImport(kind: SourceSetupKind, path: string): Promise<void>;
  onReconfigureSource(sourceId: string, kind: SourceSetupKind, path?: string): Promise<void>;
  onDeleteSource(sourceId: string): Promise<void>;
  onResetSourceCursor(sourceId: string): Promise<void>;
  onCleanupLegacyEventPrivacy(): Promise<void>;
  onCleanupPerceptionSidecars(): Promise<void>;
  onUpdateSourceRuntime(sourceId: string, action: DesktopSourceRuntimeAction): Promise<void>;
  onUpdatePerceptionSourceRuntime(
    sourceKind: DesktopSnapshot["perception"]["sources"][number]["sourceKind"],
    action: PerceptionSourceRuntimeAction
  ): Promise<void>;
}): ReactElement {
  const { t, sensitivity, sourceKind } = useI18n();
  void onSetupSource;
  const [importKind, setImportKind] = useState<SourceSetupKind>("codex");
  const [importPath, setImportPath] = useState("");
  const [preview, setPreview] = useState<DesktopSourceImportPreview | undefined>();
  const [previewError, setPreviewError] = useState<string | undefined>();
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const runtimeSourceById = new Map(
    snapshot.runtime.background.sources.map((source) => [source.sourceId, source])
  );
  const trimmedImportPath = importPath.trim();

  async function previewImport(): Promise<void> {
    if (!trimmedImportPath) return;
    setIsPreviewing(true);
    setPreviewError(undefined);
    try {
      setPreview(await onPreviewSourceImport(importKind, trimmedImportPath));
    } catch (error) {
      setPreview(undefined);
      setPreviewError(error instanceof Error ? error.message : t("source.importPreviewFailed"));
    } finally {
      setIsPreviewing(false);
    }
  }

  async function confirmImport(): Promise<void> {
    if (!trimmedImportPath) return;
    setIsImporting(true);
    setPreviewError(undefined);
    try {
      await onConfirmSourceImport(importKind, trimmedImportPath);
      setPreview(undefined);
      setImportPath("");
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : t("source.importFailed"));
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="page-grid">
      <div className="metrics-row">
        <MetricCard label={t("metric.sources")} value={snapshot.counts.sources} />
        <MetricCard label={t("metric.events")} value={snapshot.counts.events} />
        <MetricCard label={t("metric.localDb")} value="SQLite" detail={t("detail.walEnabled")} />
      </div>
      <Section
        title={
          snapshot.settings.sourceSetupCompleted
            ? t("section.sourceSetup")
            : t("section.firstRunSourceSetup")
        }
      >
        <div className="source-import-panel">
          <div className="source-import-copy">
            <p>{t("source.importBoundary")}</p>
            <div className="meta-line permission-line">
              <span>{t("source.importOnly")}</span>
              <span>{t("source.rawNotStored")}</span>
              <span>{t("source.agentExportAllowed")}</span>
            </div>
          </div>
          <div className="source-import-controls">
            <div className="segmented-control" aria-label={t("source.importKind")}>
              {(["codex", "local_agent", "seatalk"] as SourceSetupKind[]).map((kind) => (
                <button
                  className={importKind === kind ? "active" : ""}
                  key={kind}
                  onClick={() => {
                    setImportKind(kind);
                    setPreview(undefined);
                    setPreviewError(undefined);
                  }}
                  type="button"
                >
                  {sourceImportKindLabel(t, kind)}
                </button>
              ))}
            </div>
            <div className="source-import-path-row">
              <input
                aria-label={t("source.importPath")}
                className="text-input"
                onChange={(event) => {
                  setImportPath(event.currentTarget.value);
                  setPreview(undefined);
                  setPreviewError(undefined);
                }}
                placeholder={t("source.importPathPlaceholder")}
                value={importPath}
              />
              <button
                className="secondary-button"
                disabled={!trimmedImportPath || isPreviewing}
                onClick={() => void previewImport()}
                type="button"
              >
                {isPreviewing ? t("source.importPreviewing") : t("source.importPreview")}
              </button>
              <button
                className="secondary-button"
                disabled={!preview || isImporting}
                onClick={() => void confirmImport()}
                type="button"
              >
                {isImporting ? t("source.importing") : t("source.confirmImport")}
              </button>
            </div>
          </div>
          {preview ? (
            <div className="source-import-preview">
              <div>
                <span>{t("source.previewEventCount")}</span>
                <strong>{preview.eventCount}</strong>
              </div>
              <div>
                <span>{t("source.previewDateRange")}</span>
                <strong>
                  {preview.dateRange
                    ? `${preview.dateRange.from} - ${preview.dateRange.to}`
                    : t("fallback.none")}
                </strong>
              </div>
              <div>
                <span>{t("source.previewProjects")}</span>
                <strong>
                  {preview.projects.length > 0 ? preview.projects.join(", ") : t("fallback.none")}
                </strong>
              </div>
              <div>
                <span>{t("source.previewWarnings")}</span>
                <strong>{preview.warningCount}</strong>
              </div>
            </div>
          ) : null}
          {preview?.warnings.length ? (
            <p className="warning-text">{preview.warnings[0]}</p>
          ) : null}
          {previewError ? <p className="error-text">{previewError}</p> : null}
        </div>
      </Section>
      <Section title={t("section.sourceStatus")}>
        <div className="item-list">
          {snapshot.sources.map((source) => {
            const runtimeSource = runtimeSourceById.get(source.id);
            const config = snapshot.sourceAdapterConfigs[source.id];
            const importOnly = config?.mode === "import_only";
            return (
              <article className="list-item" key={source.id}>
                <div>
                  <h3>{source.displayName}</h3>
                  <div className="meta-line">
                    {sourceKind(source.kind)}
                    <span>{sensitivity(source.defaultSensitivity)}</span>
                    <span>{sourceStatusLabel(t, source, importOnly)}</span>
                    {source.lastSyncAt ? (
                      <span>{`${t("source.lastSync")} ${source.lastSyncAt}`}</span>
                    ) : null}
                    {source.lastEventAt ? (
                      <span>{`${t("source.lastEvent")} ${source.lastEventAt}`}</span>
                    ) : null}
                  </div>
                  <div className="meta-line permission-line">
                    <span>{`${t("source.retention")} ${source.permissionScope.retentionPolicyId}`}</span>
                    <span>
                      {source.permissionScope.canUseForAI
                        ? t("source.aiAllowed")
                        : t("source.aiBlocked")}
                    </span>
                    <span>
                      {source.permissionScope.canStoreRaw
                        ? t("source.rawStored")
                        : t("source.rawNotStored")}
                    </span>
                    <span>
                      {source.permissionScope.canExportToAgent
                        ? t("source.agentExportAllowed")
                        : t("source.agentExportBlocked")}
                    </span>
                  </div>
                  <div className="meta-line permission-line">
                    <span>{`${t("source.readableFields")} ${source.permissionScope.readableFields.join(", ")}`}</span>
                  </div>
                  <div className="meta-line permission-line">
                    <span>{`${t("source.interface")} ${
                      config?.setupKind ?? source.id
                    }`}</span>
                    <span>
                      {snapshot.sourceCursors[source.id]
                        ? t("source.cursorPresent")
                        : t("source.cursorEmpty")}
                    </span>
                    {config?.path ? (
                      <span>{`${t("source.path")} ${config.path}`}</span>
                    ) : null}
                    {config?.lastImport ? (
                      <span>{`${t("source.lastImport")} ${config.lastImport.importedAt}`}</span>
                    ) : null}
                  </div>
                  {runtimeSource && !importOnly ? (
                    <div className="meta-line permission-line runtime-source-line">
                      <span>{`${t("source.runtimeInterval")} ${formatDuration(runtimeSource.intervalMs)}`}</span>
                      <span>{`${t("source.runtimeNextRun")} ${
                        runtimeSource.nextRunAt ?? t("fallback.none")
                      }`}</span>
                      {runtimeSource.backoffUntil ? (
                        <span>{`${t("source.runtimeBackoff")} ${runtimeSource.backoffUntil}`}</span>
                      ) : null}
                      {runtimeSource.lastSkipReason ? (
                        <span>{`${t("source.runtimeLastSkip")} ${runtimeSource.lastSkipReason}`}</span>
                      ) : null}
                    </div>
                  ) : null}
                  {source.lastError ? <p className="error-text">{source.lastError}</p> : null}
                </div>
                <div className="source-actions">
                  {!importOnly && readReconfigurableSetupKind(config?.setupKind, source.kind) ? (
                    <button
                      className="secondary-button"
                      onClick={() => {
                        const setupKind = readReconfigurableSetupKind(
                          config?.setupKind,
                          source.kind
                        );
                        if (!setupKind) return;
                        const nextPath = window.prompt(t("prompt.sourcePath"), config?.path ?? "");
                        if (!nextPath) return;
                        void onReconfigureSource(source.id, setupKind, nextPath);
                      }}
                      type="button"
                    >
                      {t("action.reconfigure")}
                    </button>
                  ) : null}
                  <button
                    className="secondary-button"
                    onClick={() => {
                      if (!window.confirm(t("confirm.resetSourceCursor"))) return;
                      void onResetSourceCursor(source.id);
                    }}
                    type="button"
                  >
                    {t("action.resetCursor")}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={!source.enabled || importOnly}
                    onClick={() =>
                      void onUpdateSourceRuntime(source.id, source.paused ? "resume" : "pause")
                    }
                    type="button"
                  >
                    {source.paused ? t("action.resume") : t("action.pause")}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={importOnly}
                    onClick={() =>
                      void onUpdateSourceRuntime(source.id, source.enabled ? "disable" : "enable")
                    }
                    type="button"
                  >
                    {source.enabled ? t("action.disable") : t("action.enable")}
                  </button>
                  <button
                    className="secondary-button danger-button"
                    onClick={() => {
                      if (!window.confirm(t("confirm.deleteSource"))) return;
                      void onDeleteSource(source.id);
                    }}
                    type="button"
                  >
                    {t("action.deleteSource")}
                  </button>
                </div>
              </article>
            );
          })}
          {snapshot.sources.length === 0 ? (
            <div className="empty-state">{t("empty.noSources")}</div>
          ) : null}
        </div>
      </Section>
      <Section title={t("section.perceptionSources")}>
        <div className="item-list perception-source-list">
          <article className="list-item perception-control-summary">
            <div>
              <h3>{t("perception.policySnapshot")}</h3>
              <div className="meta-line">
                <span>{snapshot.perception.policySnapshot.id}</span>
                <span>{`${t("perception.samplingPreset")} ${snapshot.perception.samplingPreset.name}`}</span>
                <span>{`${t("perception.rawRetention")} ${
                  snapshot.perception.samplingPolicy.rawFrameRetention
                }`}</span>
                <span>{`${t("perception.protectedApps")} ${
                  snapshot.perception.protectedApps.filter((rule) => rule.enabled).length
                }`}</span>
              </div>
            </div>
          </article>
          {snapshot.perception.sources.map((source) => (
            <article className="list-item" key={source.sourceKind}>
              <div>
                <h3>{source.displayName}</h3>
                <div className="meta-line">
                  <span>{tPerceptionStatus(t, source.status)}</span>
                  <span>{`${t("source.retention")} ${source.policy.retentionPolicyId}`}</span>
                  <span>
                    {source.policy.canUseForAI ? t("source.aiAllowed") : t("source.aiBlocked")}
                  </span>
                  <span>
                    {source.policy.canStoreRaw ? t("source.rawStored") : t("source.rawNotStored")}
                  </span>
                  <span>
                    {source.policy.canExportToAgent
                      ? t("source.agentExportAllowed")
                      : t("source.agentExportBlocked")}
                  </span>
                </div>
                <div className="meta-line permission-line">
                  <span>{source.description}</span>
                </div>
                <div className="meta-line permission-line">
                  <span>{`${t("perception.permissions")} ${source.permissionGates
                    .map((permission) => `${permission.kind}:${permission.status}`)
                    .join(", ")}`}</span>
                </div>
              </div>
              <div className="source-actions">
                <button
                  className="secondary-button"
                  disabled={source.enabled}
                  onClick={() => void onUpdatePerceptionSourceRuntime(source.sourceKind, "enable")}
                  type="button"
                >
                  {t("action.enable")}
                </button>
                <button
                  className="secondary-button"
                  disabled={!source.enabled}
                  onClick={() =>
                    void onUpdatePerceptionSourceRuntime(
                      source.sourceKind,
                      source.paused ? "resume" : "pause"
                    )
                  }
                  type="button"
                >
                  {source.paused ? t("action.resume") : t("action.pause")}
                </button>
                <button
                  className="secondary-button"
                  disabled={!source.enabled}
                  onClick={() => void onUpdatePerceptionSourceRuntime(source.sourceKind, "disable")}
                  type="button"
                >
                  {t("action.disable")}
                </button>
                <button
                  className="secondary-button danger-button"
                  onClick={() => void onUpdatePerceptionSourceRuntime(source.sourceKind, "delete")}
                  type="button"
                >
                  {t("action.deleteSource")}
                </button>
              </div>
            </article>
          ))}
        </div>
      </Section>
      <Section title={t("section.sourceMaintenance")}>
        <div className="source-setup-grid">
          <article className="list-item">
            <div>
              <h3>{t("source.perceptionSidecarCleanup")}</h3>
              <p>{t("source.perceptionSidecarCleanupDescription")}</p>
            </div>
            <div className="source-actions">
              <button
                className="secondary-button"
                onClick={() => {
                  if (!window.confirm(t("confirm.cleanupPerceptionSidecars"))) return;
                  void onCleanupPerceptionSidecars();
                }}
                type="button"
              >
                {t("action.cleanupPerceptionSidecars")}
              </button>
            </div>
          </article>
        </div>
      </Section>
      <Section title={t("section.sourcePrivacy")}>
        <div className="item-list">
          <article className="list-item">
            <div>
              <h3>{t("source.legacyPrivacyCleanup")}</h3>
              <p>{t("source.legacyPrivacyCleanupDescription")}</p>
            </div>
            <div className="source-actions">
              <button
                className="secondary-button"
                onClick={() => {
                  if (!window.confirm(t("confirm.cleanupLegacyPrivacy"))) return;
                  void onCleanupLegacyEventPrivacy();
                }}
                type="button"
              >
                {t("action.cleanupLegacyPrivacy")}
              </button>
            </div>
          </article>
        </div>
      </Section>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function tPerceptionStatus(
  t: ReturnType<typeof useI18n>["t"],
  status: DesktopSnapshot["perception"]["status"]
): string {
  if (status === "not_configured") return t("observation.not_configured");
  if (status === "needs_permission") return t("observation.needs_permission");
  if (status === "ready") return t("observation.ready");
  if (status === "collecting") return t("observation.collecting");
  if (status === "paused") return t("observation.paused");
  if (status === "warning") return t("observation.warning");
  if (status === "error") return t("observation.error");
  return t("observation.disabled");
}

function readReconfigurableSetupKind(
  configuredKind: SourceSetupKind | undefined,
  sourceKind: string
): SourceSetupKind | undefined {
  if (configuredKind) return configuredKind;
  if (sourceKind === "codex" || sourceKind === "local_agent" || sourceKind === "seatalk") {
    return sourceKind;
  }
  return undefined;
}

function sourceImportKindLabel(
  t: ReturnType<typeof useI18n>["t"],
  kind: SourceSetupKind
): string {
  if (kind === "codex") return "Codex";
  if (kind === "local_agent") return t("source.localAgent");
  return t("source.seatalkImport");
}

function sourceStatusLabel(
  t: ReturnType<typeof useI18n>["t"],
  source: DesktopSnapshot["sources"][number],
  importOnly: boolean
): string {
  if (importOnly) return t("source.importOnly");
  if (!source.enabled) return t("state.disabled");
  if (source.paused) return t("runtime.paused");
  if (source.lastError) return t("runtime.error");
  return t("runtime.collecting");
}
