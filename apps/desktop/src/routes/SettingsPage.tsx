import { useState } from "react";
import type { ReactElement } from "react";
import type { DesktopLanguage, DesktopSettingKey, DesktopSnapshot } from "../orbitApi";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";

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
  const { t } = useI18n();
  const [databasePath, setDatabasePath] = useState(
    snapshot.settings.configuredDatabasePath ?? snapshot.dbPath
  );

  return (
    <div className="page-grid">
      <Section title={t("section.runtime")}>
        <dl className="settings-grid">
          <div>
            <dt>{t("settings.orbitHome")}</dt>
            <dd>{snapshot.orbitHome}</dd>
          </div>
          <div>
            <dt>{t("settings.activeDatabase")}</dt>
            <dd>{snapshot.dbPath}</dd>
          </div>
          <div>
            <dt>{t("settings.menuBar")}</dt>
            <dd>
              <label className="toggle-line">
                <input
                  checked={snapshot.settings.menuBarEnabled}
                  onChange={(event) =>
                    void onUpdateSetting("desktop.menuBarEnabled", event.currentTarget.checked)
                  }
                  type="checkbox"
                />
                <span>
                  {snapshot.settings.menuBarEnabled ? t("state.enabled") : t("state.disabled")}
                </span>
              </label>
            </dd>
          </div>
          <div>
            <dt>{t("settings.launchAtLogin")}</dt>
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
                <span>
                  {snapshot.settings.launchAtLoginEnabled
                    ? t("state.enabled")
                    : t("state.disabled")}
                </span>
              </label>
            </dd>
          </div>
          <div>
            <dt>{t("settings.language")}</dt>
            <dd>
              <select
                className="select-input"
                onChange={(event) =>
                  void onUpdateSetting(
                    "desktop.language",
                    event.currentTarget.value as DesktopLanguage
                  )
                }
                value={snapshot.settings.language}
              >
                <option value="system">{t("language.system")}</option>
                <option value="zh-CN">{t("language.chinese")}</option>
                <option value="en">{t("language.english")}</option>
              </select>
            </dd>
          </div>
        </dl>
      </Section>

      <Section title={t("section.databasePath")}>
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
            {t("action.savePath")}
          </button>
          <p className="muted">{t("settings.pathNote")}</p>
        </div>
      </Section>

      <Section title={t("section.dataOperations")}>
        <div className="action-row padded">
          <button
            className="secondary-button"
            onClick={() => void onReindexLocalData()}
            type="button"
          >
            {t("action.reindex")}
          </button>
          <button className="secondary-button" onClick={() => void onExportContext()} type="button">
            {t("action.exportContext")}
          </button>
          <button className="danger-button" onClick={() => void onClearLocalData()} type="button">
            {t("action.clearLocalData")}
          </button>
        </div>
      </Section>

      <Section title={t("section.aiVisual")}>
        <dl className="settings-grid">
          <div>
            <dt>{t("settings.aiProvider")}</dt>
            <dd>{snapshot.settings.aiProvider}</dd>
          </div>
          <div>
            <dt>{t("settings.externalActions")}</dt>
            <dd>
              {snapshot.settings.externalActionsEnabled ? t("state.enabled") : t("state.disabled")}
            </dd>
          </div>
          <div>
            <dt>{t("settings.visualContext")}</dt>
            <dd>
              {snapshot.settings.visualContextEnabled ? t("state.enabled") : t("state.disabled")}
            </dd>
          </div>
        </dl>
      </Section>
    </div>
  );
}
