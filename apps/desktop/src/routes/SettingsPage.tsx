import { useState } from "react";
import type { ReactElement } from "react";
import type {
  DesktopAIProviderKind,
  DesktopAIProviderTestConfig,
  DesktopAIProviderTestResult,
  DesktopLanguage,
  DesktopOpenAITokenLimitParameter,
  DesktopSettingKey,
  DesktopSnapshot
} from "../orbitApi";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";

type SettingsSectionId = "provider" | "runtime" | "storage" | "data";

export function SettingsPage({
  snapshot,
  onUpdateSetting,
  onReindexLocalData,
  onClearLocalData,
  onExportContext,
  onTestAIProvider,
  onSetCollectionPaused
}: {
  snapshot: DesktopSnapshot;
  onUpdateSetting(key: DesktopSettingKey, value: unknown): Promise<void>;
  onReindexLocalData(): Promise<void>;
  onClearLocalData(): Promise<void>;
  onExportContext(): Promise<void>;
  onTestAIProvider(config: DesktopAIProviderTestConfig): Promise<DesktopAIProviderTestResult>;
  onSetCollectionPaused(paused: boolean): Promise<void>;
}): ReactElement {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("provider");
  const [databasePath, setDatabasePath] = useState(
    snapshot.settings.configuredDatabasePath ?? snapshot.dbPath
  );
  const [aiProviderKind, setAiProviderKind] = useState<DesktopAIProviderKind>(
    snapshot.settings.aiProvider as DesktopAIProviderKind
  );
  const [aiBaseUrl, setAiBaseUrl] = useState(snapshot.settings.aiBaseUrl ?? "");
  const [aiModel, setAiModel] = useState(snapshot.settings.aiModel ?? "");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiTokenLimitParameter, setAiTokenLimitParameter] =
    useState<DesktopOpenAITokenLimitParameter>(snapshot.settings.aiTokenLimitParameter);
  const [aiMaxTokens, setAiMaxTokens] = useState(String(snapshot.settings.aiMaxTokens));
  const [aiTestMaxTokens, setAiTestMaxTokens] = useState(String(snapshot.settings.aiTestMaxTokens));
  const [providerTestResult, setProviderTestResult] = useState<
    DesktopAIProviderTestResult | undefined
  >();
  const [providerTestError, setProviderTestError] = useState<string | undefined>();
  const [isTestingProvider, setIsTestingProvider] = useState(false);
  const saveAiProvider = async (): Promise<void> => {
    setProviderTestResult(undefined);
    setProviderTestError(undefined);
    await onUpdateSetting("ai.providerKind", aiProviderKind);
    await onUpdateSetting("ai.baseUrl", aiBaseUrl);
    await onUpdateSetting("ai.model", aiModel);
    await onUpdateSetting("ai.tokenLimitParameter", aiTokenLimitParameter);
    await onUpdateSetting("ai.maxTokens", aiMaxTokens);
    await onUpdateSetting("ai.testMaxTokens", aiTestMaxTokens);
    if (aiApiKey.trim() || !snapshot.settings.aiApiKeyConfigured) {
      await onUpdateSetting("ai.apiKey", aiApiKey);
      setAiApiKey("");
    }
  };
  const testAiProvider = async (): Promise<void> => {
    setProviderTestResult(undefined);
    setProviderTestError(undefined);
    setIsTestingProvider(true);
    try {
      setProviderTestResult(
        await onTestAIProvider({
          providerKind: aiProviderKind,
          baseUrl: aiBaseUrl,
          model: aiModel,
          apiKey: aiApiKey,
          tokenLimitParameter: aiTokenLimitParameter,
          maxTokens: aiMaxTokens,
          testMaxTokens: aiTestMaxTokens
        })
      );
    } catch (reason) {
      setProviderTestError(reason instanceof Error ? reason.message : t("error.aiProviderTest"));
    } finally {
      setIsTestingProvider(false);
    }
  };
  const clearLocalData = async (): Promise<void> => {
    if (!window.confirm(t("confirm.clearLocalData"))) return;
    await onClearLocalData();
  };
  const settingsSections: Array<{ id: SettingsSectionId; label: string; detail: string }> = [
    {
      id: "provider",
      label: t("settingsNav.provider"),
      detail: t("settingsNav.providerDetail")
    },
    {
      id: "runtime",
      label: t("settingsNav.runtime"),
      detail: t("settingsNav.runtimeDetail")
    },
    {
      id: "storage",
      label: t("settingsNav.storage"),
      detail: t("settingsNav.storageDetail")
    },
    {
      id: "data",
      label: t("settingsNav.data"),
      detail: t("settingsNav.dataDetail")
    }
  ];

  return (
    <div className="settings-layout">
      <nav aria-label={t("aria.settingsSections")} className="settings-subnav">
        {settingsSections.map((section) => (
          <button
            aria-current={activeSection === section.id ? "page" : undefined}
            className="settings-subnav-item"
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            type="button"
          >
            <span>{section.label}</span>
            <small>{section.detail}</small>
          </button>
        ))}
      </nav>

      <div className="settings-content">
        {activeSection === "provider" ? (
          <Section title={t("settingsNav.provider")}>
            <div className="settings-panel">
              <dl className="settings-grid">
                <div>
                  <dt>{t("settings.aiProvider")}</dt>
                  <dd>
                    <select
                      className="select-input"
                      onChange={(event) =>
                        setAiProviderKind(event.currentTarget.value as DesktopAIProviderKind)
                      }
                      value={aiProviderKind}
                    >
                      <option value="disabled">{t("provider.disabled")}</option>
                      <option value="mock">{t("provider.mock")}</option>
                      <option value="openai-compatible">{t("provider.openaiCompatible")}</option>
                    </select>
                  </dd>
                </div>
                <div>
                  <dt>{t("settings.aiBaseUrl")}</dt>
                  <dd>
                    <input
                      className="text-input"
                      disabled={aiProviderKind !== "openai-compatible"}
                      onChange={(event) => setAiBaseUrl(event.currentTarget.value)}
                      placeholder="https://api.openai.com/v1"
                      value={aiBaseUrl}
                    />
                  </dd>
                </div>
                <div>
                  <dt>{t("settings.aiModel")}</dt>
                  <dd>
                    <input
                      className="text-input"
                      disabled={aiProviderKind !== "openai-compatible"}
                      onChange={(event) => setAiModel(event.currentTarget.value)}
                      placeholder="gpt-4o-mini"
                      value={aiModel}
                    />
                  </dd>
                </div>
                <div>
                  <dt>{t("settings.aiApiKey")}</dt>
                  <dd>
                    <input
                      className="text-input"
                      disabled={aiProviderKind !== "openai-compatible"}
                      onChange={(event) => setAiApiKey(event.currentTarget.value)}
                      placeholder={
                        snapshot.settings.aiApiKeyConfigured
                          ? t("settings.aiApiKeyPlaceholderConfigured")
                          : t("settings.aiApiKeyPlaceholder")
                      }
                      type="password"
                      value={aiApiKey}
                    />
                  </dd>
                </div>
                <div>
                  <dt>{t("settings.aiTokenLimitParameter")}</dt>
                  <dd>
                    <select
                      className="select-input"
                      disabled={aiProviderKind !== "openai-compatible"}
                      onChange={(event) =>
                        setAiTokenLimitParameter(
                          event.currentTarget.value as DesktopOpenAITokenLimitParameter
                        )
                      }
                      value={aiTokenLimitParameter}
                    >
                      <option value="max_tokens">max_tokens</option>
                      <option value="max_completion_tokens">max_completion_tokens</option>
                    </select>
                  </dd>
                </div>
                <div>
                  <dt>{t("settings.aiMaxTokens")}</dt>
                  <dd>
                    <input
                      className="text-input compact-input"
                      disabled={aiProviderKind !== "openai-compatible"}
                      min={1}
                      onChange={(event) => setAiMaxTokens(event.currentTarget.value)}
                      type="number"
                      value={aiMaxTokens}
                    />
                  </dd>
                </div>
                <div>
                  <dt>{t("settings.aiTestMaxTokens")}</dt>
                  <dd>
                    <input
                      className="text-input compact-input"
                      disabled={aiProviderKind !== "openai-compatible"}
                      min={1}
                      onChange={(event) => setAiTestMaxTokens(event.currentTarget.value)}
                      type="number"
                      value={aiTestMaxTokens}
                    />
                  </dd>
                </div>
                <div>
                  <dt>{t("settings.externalActions")}</dt>
                  <dd>
                    {snapshot.settings.externalActionsEnabled
                      ? t("state.enabled")
                      : t("state.disabled")}
                  </dd>
                </div>
                <div>
                  <dt>{t("settings.visualContext")}</dt>
                  <dd>
                    {snapshot.settings.visualContextEnabled
                      ? t("state.enabled")
                      : t("state.disabled")}
                  </dd>
                </div>
              </dl>
              <div className="provider-actions">
                <button
                  className="secondary-button"
                  disabled={isTestingProvider}
                  onClick={() => void saveAiProvider()}
                  type="button"
                >
                  {t("action.saveAiProvider")}
                </button>
                <button
                  className="secondary-button"
                  disabled={aiProviderKind === "disabled" || isTestingProvider}
                  onClick={() => void testAiProvider()}
                  type="button"
                >
                  {isTestingProvider ? t("action.testingConnection") : t("action.testConnection")}
                </button>
              </div>
              {providerTestResult ? (
                <div
                  className={`connection-status ${providerTestResult.ok ? "success" : "error"}`}
                  role={providerTestResult.ok ? "status" : "alert"}
                >
                  <strong>
                    {providerTestResult.ok
                      ? t("settings.aiProviderTestSuccess")
                      : t("settings.aiProviderTestFailed")}
                  </strong>
                  <span>
                    {providerTestResult.message} · {providerTestResult.latencyMs}ms
                  </span>
                  {providerTestResult.endpoint ? <code>{providerTestResult.endpoint}</code> : null}
                </div>
              ) : null}
              {providerTestError ? (
                <div className="connection-status error" role="alert">
                  <strong>{t("settings.aiProviderTestFailed")}</strong>
                  <span>{providerTestError}</span>
                </div>
              ) : null}
              <p className="muted">{t("settings.aiProviderNote")}</p>
            </div>
          </Section>
        ) : null}

        {activeSection === "runtime" ? (
          <Section title={t("section.runtime")}>
            <dl className="settings-grid">
              <div>
                <dt>{t("settings.runtimeStatus")}</dt>
                <dd>
                  <span className={`runtime-pill ${snapshot.runtime.status}`}>
                    {tRuntimeStatus(t, snapshot.runtime.status)}
                  </span>
                </dd>
              </div>
              <div>
                <dt>{t("settings.backgroundCollection")}</dt>
                <dd>
                  <label className="toggle-line">
                    <input
                      checked={!snapshot.runtime.collectionPaused}
                      onChange={(event) => void onSetCollectionPaused(!event.currentTarget.checked)}
                      type="checkbox"
                    />
                    <span>
                      {snapshot.runtime.collectionPaused
                        ? t("runtime.paused")
                        : t("runtime.collecting")}
                    </span>
                  </label>
                </dd>
              </div>
              <div>
                <dt>{t("settings.lastBackgroundRun")}</dt>
                <dd>{snapshot.runtime.lastRunAt ?? t("fallback.none")}</dd>
              </div>
              <div>
                <dt>{t("settings.lastBackgroundCompleted")}</dt>
                <dd>{snapshot.runtime.lastCompletedAt ?? t("fallback.none")}</dd>
              </div>
              <div>
                <dt>{t("settings.lastBackgroundError")}</dt>
                <dd>{snapshot.runtime.lastError ?? t("fallback.none")}</dd>
              </div>
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
        ) : null}

        {activeSection === "storage" ? (
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
        ) : null}

        {activeSection === "data" ? (
          <Section title={t("section.dataOperations")}>
            <div className="action-row padded">
              <button
                className="secondary-button"
                onClick={() => void onReindexLocalData()}
                type="button"
              >
                {t("action.reindex")}
              </button>
              <button
                className="secondary-button"
                onClick={() => void onExportContext()}
                type="button"
              >
                {t("action.exportContext")}
              </button>
              <button
                className="danger-button"
                onClick={() => void clearLocalData()}
                type="button"
              >
                {t("action.clearLocalData")}
              </button>
            </div>
          </Section>
        ) : null}
      </div>
    </div>
  );
}

function tRuntimeStatus(
  t: ReturnType<typeof useI18n>["t"],
  status: DesktopSnapshot["runtime"]["status"]
): string {
  if (status === "collecting") return t("runtime.collecting");
  if (status === "paused") return t("runtime.paused");
  if (status === "error") return t("runtime.error");
  return t("runtime.idle");
}
