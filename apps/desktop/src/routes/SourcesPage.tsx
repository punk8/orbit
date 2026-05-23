import { useState } from "react";
import type { ReactElement } from "react";
import type { DesktopSnapshot, DesktopSourceRuntimeAction, SourceSetupKind } from "../orbitApi";
import type { PerceptionSourceRuntimeAction } from "@orbit/core";
import { MetricCard } from "../components/MetricCard";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";

export function SourcesPage({
  snapshot,
  onSetupSource,
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
  const [codexPath, setCodexPath] = useState("");
  const [localAgentPath, setLocalAgentPath] = useState("");
  const [seatalkPath, setSeatalkPath] = useState("");
  const runtimeSourceById = new Map(
    snapshot.runtime.background.sources.map((source) => [source.sourceId, source])
  );

  return (
    <div className="page-grid">
      <div className="metrics-row">
        <MetricCard label={t("metric.sources")} value={snapshot.counts.sources} />
        <MetricCard label={t("metric.events")} value={snapshot.counts.events} />
        <MetricCard label={t("metric.localDb")} value="SQLite" detail={t("detail.walEnabled")} />
      </div>
      <Section title={t("section.sourceStatus")}>
        <div className="item-list">
          {snapshot.sources.map((source) => {
            const runtimeSource = runtimeSourceById.get(source.id);
            return (
              <article className="list-item" key={source.id}>
                <div>
                  <h3>{source.displayName}</h3>
                  <div className="meta-line">
                    {sourceKind(source.kind)}
                    <span>{sensitivity(source.defaultSensitivity)}</span>
                    <span>{sourceStatusLabel(t, source)}</span>
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
                      snapshot.sourceAdapterConfigs[source.id]?.setupKind ?? source.id
                    }`}</span>
                    <span>
                      {snapshot.sourceCursors[source.id]
                        ? t("source.cursorPresent")
                        : t("source.cursorEmpty")}
                    </span>
                    {snapshot.sourceAdapterConfigs[source.id]?.path ? (
                      <span>{`${t("source.path")} ${snapshot.sourceAdapterConfigs[source.id]?.path}`}</span>
                    ) : null}
                  </div>
                  {runtimeSource ? (
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
                  {readReconfigurableSetupKind(
                    snapshot.sourceAdapterConfigs[source.id]?.setupKind,
                    source.kind
                  ) ? (
                    <button
                      className="secondary-button"
                      onClick={() => {
                        const config = snapshot.sourceAdapterConfigs[source.id];
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
                    disabled={!source.enabled}
                    onClick={() =>
                      void onUpdateSourceRuntime(source.id, source.paused ? "resume" : "pause")
                    }
                    type="button"
                  >
                    {source.paused ? t("action.resume") : t("action.pause")}
                  </button>
                  <button
                    className="secondary-button"
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
      <Section
        title={
          snapshot.settings.sourceSetupCompleted
            ? t("section.sourceSetup")
            : t("section.firstRunSourceSetup")
        }
      >
        <div className="source-setup-grid">
          <article className="setup-card">
            <h3>Codex</h3>
            <p>{t("source.codexDescription")}</p>
            <input
              className="text-input"
              onChange={(event) => setCodexPath(event.currentTarget.value)}
              value={codexPath}
            />
            <button
              className="secondary-button"
              disabled={codexPath.trim().length === 0}
              onClick={() => void onSetupSource("codex", codexPath)}
              type="button"
            >
              {t("action.configureCodex")}
            </button>
          </article>
          <article className="setup-card">
            <h3>{t("source.localAgent")}</h3>
            <p>{t("source.localAgentDescription")}</p>
            <input
              className="text-input"
              onChange={(event) => setLocalAgentPath(event.currentTarget.value)}
              value={localAgentPath}
            />
            <button
              className="secondary-button"
              disabled={localAgentPath.trim().length === 0}
              onClick={() => void onSetupSource("local_agent", localAgentPath)}
              type="button"
            >
              {t("action.configureAgent")}
            </button>
          </article>
          <article className="setup-card">
            <h3>{t("source.seatalkImport")}</h3>
            <p>{t("source.seatalkDescription")}</p>
            <input
              className="text-input"
              onChange={(event) => setSeatalkPath(event.currentTarget.value)}
              value={seatalkPath}
            />
            <button
              className="secondary-button"
              disabled={seatalkPath.trim().length === 0}
              onClick={() => void onSetupSource("seatalk", seatalkPath)}
              type="button"
            >
              {t("action.configureSeaTalk")}
            </button>
          </article>
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

function sourceStatusLabel(
  t: ReturnType<typeof useI18n>["t"],
  source: DesktopSnapshot["sources"][number]
): string {
  if (!source.enabled) return t("state.disabled");
  if (source.paused) return t("runtime.paused");
  if (source.lastError) return t("runtime.error");
  return t("runtime.collecting");
}
