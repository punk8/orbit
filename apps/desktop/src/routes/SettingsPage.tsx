import { useState } from "react";
import type { ReactElement } from "react";
import type { DesktopSettingKey, DesktopSnapshot } from "../orbitApi";
import { Section } from "../components/Section";

export function SettingsPage({
  snapshot,
  onUpdateSetting,
  onReindexLocalData,
  onClearLocalData,
  onExportContext
}: {
  snapshot: DesktopSnapshot;
  onUpdateSetting(key: DesktopSettingKey, value: unknown): Promise<void>;
  onReindexLocalData(): Promise<void>;
  onClearLocalData(): Promise<void>;
  onExportContext(): Promise<void>;
}): ReactElement {
  const [databasePath, setDatabasePath] = useState(
    snapshot.settings.configuredDatabasePath ?? snapshot.dbPath
  );

  return (
    <div className="page-grid">
      <Section title="Runtime">
        <dl className="settings-grid">
          <div>
            <dt>Orbit Home</dt>
            <dd>{snapshot.orbitHome}</dd>
          </div>
          <div>
            <dt>Active Database</dt>
            <dd>{snapshot.dbPath}</dd>
          </div>
          <div>
            <dt>Menu Bar</dt>
            <dd>
              <label className="toggle-line">
                <input
                  checked={snapshot.settings.menuBarEnabled}
                  onChange={(event) =>
                    void onUpdateSetting("desktop.menuBarEnabled", event.currentTarget.checked)
                  }
                  type="checkbox"
                />
                <span>{snapshot.settings.menuBarEnabled ? "enabled" : "disabled"}</span>
              </label>
            </dd>
          </div>
          <div>
            <dt>Launch At Login</dt>
            <dd>
              <label className="toggle-line">
                <input
                  checked={snapshot.settings.launchAtLoginEnabled}
                  onChange={(event) =>
                    void onUpdateSetting(
                      "desktop.launchAtLoginEnabled",
                      event.currentTarget.checked
                    )
                  }
                  type="checkbox"
                />
                <span>{snapshot.settings.launchAtLoginEnabled ? "enabled" : "disabled"}</span>
              </label>
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Database Path">
        <div className="settings-panel">
          <input
            className="text-input"
            onChange={(event) => setDatabasePath(event.currentTarget.value)}
            value={databasePath}
          />
          <button
            className="secondary-button"
            onClick={() => void onUpdateSetting("storage.configuredDatabasePath", databasePath)}
            type="button"
          >
            Save Path
          </button>
          <p className="muted">
            Path changes are persisted as a restart boundary. The active connection stays on the
            current database until the next launch.
          </p>
        </div>
      </Section>

      <Section title="Data Operations">
        <div className="action-row padded">
          <button
            className="secondary-button"
            onClick={() => void onReindexLocalData()}
            type="button"
          >
            Re-index
          </button>
          <button className="secondary-button" onClick={() => void onExportContext()} type="button">
            Export Context
          </button>
          <button className="danger-button" onClick={() => void onClearLocalData()} type="button">
            Clear Local Data
          </button>
        </div>
      </Section>

      <Section title="AI And Visual Context">
        <dl className="settings-grid">
          <div>
            <dt>AI Provider</dt>
            <dd>{snapshot.settings.aiProvider}</dd>
          </div>
          <div>
            <dt>External Actions</dt>
            <dd>{snapshot.settings.externalActionsEnabled ? "enabled" : "disabled"}</dd>
          </div>
          <div>
            <dt>Visual Context Input</dt>
            <dd>{snapshot.settings.visualContextEnabled ? "enabled" : "disabled"}</dd>
          </div>
        </dl>
      </Section>
    </div>
  );
}
