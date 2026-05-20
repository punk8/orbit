import { useState } from "react";
import type { ReactElement } from "react";
import type { DesktopSnapshot, DesktopSourceRuntimeAction, SourceSetupKind } from "../orbitApi";
import { MetricCard } from "../components/MetricCard";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";

export function SourcesPage({
  snapshot,
  onSetupSource,
  onUpdateSourceRuntime
}: {
  snapshot: DesktopSnapshot;
  onSetupSource(kind: SourceSetupKind, path?: string): Promise<void>;
  onUpdateSourceRuntime(sourceId: string, action: DesktopSourceRuntimeAction): Promise<void>;
}): ReactElement {
  const { t, sensitivity, sourceKind } = useI18n();
  const [codexPath, setCodexPath] = useState("fixtures/realistic/codex");
  const [localAgentPath, setLocalAgentPath] = useState("fixtures/realistic/local-agent");
  const [seatalkPath, setSeatalkPath] = useState("fixtures/seatalk");

  return (
    <div className="page-grid">
      <div className="metrics-row">
        <MetricCard label={t("metric.sources")} value={snapshot.counts.sources} />
        <MetricCard label={t("metric.events")} value={snapshot.counts.events} />
        <MetricCard label={t("metric.localDb")} value="SQLite" detail={t("detail.walEnabled")} />
      </div>
      <Section title={t("section.sourceStatus")}>
        <div className="item-list">
          {snapshot.sources.map((source) => (
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
                {source.lastError ? <p className="error-text">{source.lastError}</p> : null}
              </div>
              <div className="source-actions">
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
              </div>
            </article>
          ))}
          {snapshot.sources.length === 0 ? (
            <div className="empty-state">{t("empty.noSources")}</div>
          ) : null}
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
            <h3>{t("source.fixtures")}</h3>
            <p>{t("source.fixturesDescription")}</p>
            <button
              className="secondary-button"
              onClick={() => void onSetupSource("fixtures")}
              type="button"
            >
              {t("action.loadFixtures")}
            </button>
          </article>
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
              onClick={() => void onSetupSource("seatalk", seatalkPath)}
              type="button"
            >
              {t("action.configureSeaTalk")}
            </button>
          </article>
        </div>
      </Section>
    </div>
  );
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
