import { useState } from "react";
import type { ReactElement } from "react";
import type { DesktopSnapshot, SourceSetupKind } from "../orbitApi";
import { MetricCard } from "../components/MetricCard";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";

export function SourcesPage({
  snapshot,
  onSetupSource
}: {
  snapshot: DesktopSnapshot;
  onSetupSource(kind: SourceSetupKind, path?: string): Promise<void>;
}): ReactElement {
  const { t, sensitivity } = useI18n();
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
                  {source.kind}
                  <span>{sensitivity(source.defaultSensitivity)}</span>
                  <span>{source.enabled ? t("state.enabled") : t("state.disabled")}</span>
                </div>
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
