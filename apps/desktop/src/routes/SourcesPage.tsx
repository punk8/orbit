import { useState } from "react";
import type { ReactElement } from "react";
import type { DesktopSnapshot, SourceSetupKind } from "../orbitApi";
import { MetricCard } from "../components/MetricCard";
import { Section } from "../components/Section";

export function SourcesPage({
  snapshot,
  onSetupSource
}: {
  snapshot: DesktopSnapshot;
  onSetupSource(kind: SourceSetupKind, path?: string): Promise<void>;
}): ReactElement {
  const [codexPath, setCodexPath] = useState("fixtures/realistic/codex");
  const [localAgentPath, setLocalAgentPath] = useState("fixtures/realistic/local-agent");
  const [seatalkPath, setSeatalkPath] = useState("fixtures/seatalk");

  return (
    <div className="page-grid">
      <div className="metrics-row">
        <MetricCard label="Sources" value={snapshot.counts.sources} />
        <MetricCard label="Events" value={snapshot.counts.events} />
        <MetricCard label="Local DB" value="SQLite" detail="WAL enabled" />
      </div>
      <Section title="Source Status">
        <div className="item-list">
          {snapshot.sources.map((source) => (
            <article className="list-item" key={source.id}>
              <div>
                <h3>{source.displayName}</h3>
                <div className="meta-line">
                  {source.kind}
                  <span>{source.defaultSensitivity}</span>
                  <span>{source.enabled ? "enabled" : "disabled"}</span>
                </div>
              </div>
            </article>
          ))}
          {snapshot.sources.length === 0 ? (
            <div className="empty-state">No sources configured</div>
          ) : null}
        </div>
      </Section>
      <Section
        title={snapshot.settings.sourceSetupCompleted ? "Source Setup" : "First-run Source Setup"}
      >
        <div className="source-setup-grid">
          <article className="setup-card">
            <h3>Fixtures</h3>
            <p>Load bundled Codex and SeaTalk fixtures for local validation.</p>
            <button
              className="secondary-button"
              onClick={() => void onSetupSource("fixtures")}
              type="button"
            >
              Load Fixtures
            </button>
          </article>
          <article className="setup-card">
            <h3>Codex</h3>
            <p>Read sanitized Codex sessions from an explicit local path.</p>
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
              Configure Codex
            </button>
          </article>
          <article className="setup-card">
            <h3>Local Agent</h3>
            <p>Read Claude Code or other local agent sessions through the generic adapter.</p>
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
              Configure Agent
            </button>
          </article>
          <article className="setup-card">
            <h3>SeaTalk Import</h3>
            <p>Read approved, user-provided SeaTalk import files only.</p>
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
              Configure SeaTalk
            </button>
          </article>
        </div>
      </Section>
    </div>
  );
}
