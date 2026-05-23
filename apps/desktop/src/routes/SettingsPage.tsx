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
import type {
  PerceptionProviderKind,
  PerceptionProviderTask,
  PerceptionSamplingPresetName,
  PerceptionSourceKind,
  PerceptionSourcePolicyPatch,
  PerceptionSourceRuntimeAction
} from "@orbit/core";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";

type SettingsSectionId = "provider" | "privacy" | "runtime" | "indexing" | "storage" | "data";

export function SettingsPage({
  snapshot,
  onUpdateSetting,
  onReindexLocalData,
  onClearLocalData,
  onExportContext,
  onTestAIProvider,
  onSetCollectionPaused,
  onStartObservation,
  onPauseObservation,
  onResumeObservation,
  onStopObservation,
  onRequestScreenRecordingPermission,
  onUpdatePerceptionSourceRuntime,
  onUpdatePerceptionSourcePolicy,
  onUpdatePerceptionProviderRoute,
  onUpdatePerceptionSamplingPreset,
  onCaptureScreenOcrBurst,
  onCleanupPerceptionSidecars
}: {
  snapshot: DesktopSnapshot;
  onUpdateSetting(key: DesktopSettingKey, value: unknown): Promise<void>;
  onReindexLocalData(): Promise<void>;
  onClearLocalData(): Promise<void>;
  onExportContext(): Promise<void>;
  onTestAIProvider(config: DesktopAIProviderTestConfig): Promise<DesktopAIProviderTestResult>;
  onSetCollectionPaused(paused: boolean): Promise<void>;
  onStartObservation(): Promise<void>;
  onPauseObservation(): Promise<void>;
  onResumeObservation(): Promise<void>;
  onStopObservation(): Promise<void>;
  onRequestScreenRecordingPermission(): Promise<void>;
  onUpdatePerceptionSourceRuntime(
    sourceKind: PerceptionSourceKind,
    action: PerceptionSourceRuntimeAction
  ): Promise<void>;
  onUpdatePerceptionSourcePolicy(
    sourceKind: PerceptionSourceKind,
    patch: PerceptionSourcePolicyPatch
  ): Promise<void>;
  onUpdatePerceptionProviderRoute(
    task: PerceptionProviderTask,
    provider: PerceptionProviderKind
  ): Promise<void>;
  onUpdatePerceptionSamplingPreset(preset: PerceptionSamplingPresetName): Promise<void>;
  onCaptureScreenOcrBurst(): Promise<void>;
  onCleanupPerceptionSidecars(): Promise<void>;
}): ReactElement {
  const { t, sensitivity, sourceKind } = useI18n();
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
  const aiAllowedSources = snapshot.sources.filter(
    (source) => source.permissionScope.canUseForAI
  ).length;
  const rawStorageAllowedSources = snapshot.sources.filter(
    (source) => source.permissionScope.canStoreRaw
  ).length;
  const agentExportAllowedSources = snapshot.sources.filter(
    (source) => source.permissionScope.canExportToAgent
  ).length;
  const confirmedKnowledgeCount = snapshot.knowledgeArtifacts.filter(
    (artifact) => artifact.status === "confirmed"
  ).length;
  const blockedKnowledgeCount = snapshot.knowledgeArtifacts.length - confirmedKnowledgeCount;
  const confirmedMemoryCount = snapshot.memories.filter(
    (memory) => memory.status === "confirmed"
  ).length;
  const blockedMemoryCount = snapshot.memories.length - confirmedMemoryCount;
  const retentionPolicies = Array.from(
    new Set(snapshot.sources.map((source) => source.permissionScope.retentionPolicyId))
  );
  const dogfoodRuntime = snapshot.perception.dogfoodRuntime;
  const screenOcrCanResume =
    dogfoodRuntime.state === "paused_user" || dogfoodRuntime.state === "stopped";
  const screenOcrCanPause =
    dogfoodRuntime.state === "observing" ||
    dogfoodRuntime.state === "protected" ||
    dogfoodRuntime.state === "paused_resource";
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
      id: "privacy",
      label: t("settingsNav.privacy"),
      detail: t("settingsNav.privacyDetail")
    },
    {
      id: "runtime",
      label: t("settingsNav.runtime"),
      detail: t("settingsNav.runtimeDetail")
    },
    {
      id: "indexing",
      label: t("settingsNav.indexing"),
      detail: t("settingsNav.indexingDetail")
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
            data-settings-section-id={section.id}
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
              <div className="settings-policy-block provider-boundary">
                <h3>{t("settings.providerTaskBoundary")}</h3>
                <dl className="mini-grid">
                  <DetailRow
                    label={t("settings.providerTaskKnowledgeDrafting")}
                    value={providerBoundaryValue(t, aiProviderKind)}
                  />
                  <DetailRow
                    label={t("settings.providerTaskActivity")}
                    value={t("settings.providerTaskLocalOnly")}
                  />
                  <DetailRow
                    label={t("settings.providerTaskMemory")}
                    value={t("settings.providerTaskReviewOnly")}
                  />
                  <DetailRow
                    label={t("settings.providerTaskRecommendation")}
                    value={t("settings.providerTaskReadOnly")}
                  />
                  <DetailRow
                    label={t("settings.providerTaskEmbeddings")}
                    value={t("settings.providerTaskFtsFallback")}
                  />
                  <DetailRow
                    label={t("settings.providerTaskConnectionTest")}
                    value={t("settings.providerTaskSyntheticTest")}
                  />
                </dl>
              </div>
              <div className="settings-policy-block perception-provider-routing">
                <h3>{t("settings.perceptionProviderRouting")}</h3>
                <dl className="mini-grid">
                  {snapshot.perception.providerRoutes.map((route) => (
                    <div key={route.task}>
                      <dt>{perceptionProviderTaskLabel(t, route.task)}</dt>
                      <dd>
                        <select
                          className="select-input compact-select"
                          onChange={(event) =>
                            void onUpdatePerceptionProviderRoute(
                              route.task,
                              event.currentTarget.value as PerceptionProviderKind
                            )
                          }
                          value={route.provider}
                        >
                          <option value="disabled">{t("provider.disabled")}</option>
                          <option value="local">{t("provider.local")}</option>
                          <option value="openai-compatible">
                            {t("provider.openaiCompatible")}
                          </option>
                        </select>
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="muted">{t("settings.perceptionProviderRoutingNote")}</p>
              </div>
              <div className="settings-policy-block provider-runtime-registry">
                <h3>{t("settings.providerRuntimeRegistry")}</h3>
                <dl className="mini-grid">
                  {snapshot.aiProviderRuntime.tasks.map((resolution) => (
                    <div key={resolution.task}>
                      <dt>{providerRuntimeTaskLabel(t, resolution.task)}</dt>
                      <dd>
                        <span className={`status-pill ${resolution.state}`}>
                          {providerKindLabel(t, resolution.providerKind)} ·{" "}
                          {providerRuntimeStateLabel(t, resolution.state)}
                        </span>
                        <small>{resolution.reason}</small>
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="muted">{t("settings.providerRuntimeRegistryNote")}</p>
              </div>
            </div>
          </Section>
        ) : null}

        {activeSection === "privacy" ? (
          <div className="settings-section-stack privacy-settings-panel">
            <Section title={t("section.privacyPermissions")}>
              <dl className="settings-grid">
                <DetailRow
                  label={t("settings.localOnlyMode")}
                  value={snapshot.settings.localOnly ? t("state.enabled") : t("app.remoteEnabled")}
                />
                <DetailRow
                  label={t("settings.externalActions")}
                  value={
                    snapshot.settings.externalActionsEnabled
                      ? t("state.enabled")
                      : t("settings.externalActionsDisabledAlpha")
                  }
                />
                <DetailRow
                  label={t("settings.visualContext")}
                  value={
                    snapshot.settings.visualContextEnabled
                      ? t("state.enabled")
                      : t("settings.visualContextDisabledAlpha")
                  }
                />
                <DetailRow
                  label={t("settings.apiKeyStorage")}
                  value={
                    snapshot.settings.aiApiKeyConfigured
                      ? t("settings.apiKeyEncrypted")
                      : t("state.notConfigured")
                  }
                />
                <DetailRow
                  label={t("settings.aiAllowedSources")}
                  value={countSummary(aiAllowedSources, snapshot.sources.length)}
                />
                <DetailRow
                  label={t("settings.rawStorageAllowedSources")}
                  value={countSummary(rawStorageAllowedSources, snapshot.sources.length)}
                />
                <DetailRow
                  label={t("settings.agentExportAllowedSources")}
                  value={countSummary(agentExportAllowedSources, snapshot.sources.length)}
                />
                <DetailRow
                  label={t("settings.retentionPolicies")}
                  value={
                    retentionPolicies.length > 0 ? retentionPolicies.join(", ") : t("fallback.none")
                  }
                />
              </dl>
            </Section>
            <Section title={t("section.sourcePolicyMatrix")}>
              <div className="source-policy-list">
                {snapshot.sources.map((source) => (
                  <article className="source-policy-row" key={source.id}>
                    <div>
                      <h3>{source.displayName}</h3>
                      <p>{`${sourceKind(source.kind)} · ${sensitivity(source.defaultSensitivity)} · ${
                        source.permissionScope.retentionPolicyId
                      }`}</p>
                    </div>
                    <div className="source-policy-badges">
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
                  </article>
                ))}
                {snapshot.sources.length === 0 ? (
                  <div className="empty-state compact">{t("empty.noSources")}</div>
                ) : null}
              </div>
            </Section>
            <Section title={t("section.perceptionPolicyMatrix")}>
              <div className="source-policy-list perception-policy-list">
                {snapshot.perception.sources.map((source) => (
                  <article
                    className="source-policy-row perception-policy-row"
                    key={source.sourceKind}
                  >
                    <div>
                      <h3>{source.displayName}</h3>
                      <p>{`${tPerceptionStatus(t, source.status)} · ${
                        source.policy.retentionPolicyId
                      } · ${source.permissionGates
                        .map((permission) => `${permission.kind}:${permission.status}`)
                        .join(", ")}`}</p>
                    </div>
                    <div className="source-policy-badges">
                      <PolicyToggle
                        checked={source.policy.canStoreSummary}
                        label={t("perception.summaryStorage")}
                        onChange={(checked) =>
                          void onUpdatePerceptionSourcePolicy(source.sourceKind, {
                            canStoreSummary: checked
                          })
                        }
                      />
                      <PolicyToggle
                        checked={source.policy.canUseForAI}
                        label={t("perception.aiUse")}
                        onChange={(checked) =>
                          void onUpdatePerceptionSourcePolicy(source.sourceKind, {
                            canUseForAI: checked
                          })
                        }
                      />
                      <PolicyToggle
                        checked={source.policy.canExportToAgent}
                        label={t("perception.agentExport")}
                        onChange={(checked) =>
                          void onUpdatePerceptionSourcePolicy(source.sourceKind, {
                            canExportToAgent: checked
                          })
                        }
                      />
                      <PolicyToggle
                        checked={source.policy.canStoreRaw}
                        label={t("perception.rawSidecar")}
                        onChange={(checked) =>
                          void onUpdatePerceptionSourcePolicy(source.sourceKind, {
                            canStoreRaw: checked,
                            rawRetentionTtlMinutes: checked ? 60 : null
                          })
                        }
                      />
                    </div>
                  </article>
                ))}
              </div>
            </Section>
            <Section title={t("section.perceptionBudgets")}>
              <dl className="settings-grid">
                <DetailRow
                  label={t("settings.screenRecordingPermission")}
                  value={readPermissionStatus(snapshot, "screen")}
                />
                <div>
                  <dt>{t("settings.samplingPreset")}</dt>
                  <dd>
                    <select
                      className="select-input compact-select"
                      onChange={(event) =>
                        void onUpdatePerceptionSamplingPreset(
                          event.currentTarget.value as PerceptionSamplingPresetName
                        )
                      }
                      value={snapshot.perception.samplingPreset.name}
                    >
                      <option value="conservative">{t("perception.sampling.conservative")}</option>
                      <option value="balanced">{t("perception.sampling.balanced")}</option>
                      <option value="intensive">{t("perception.sampling.intensive")}</option>
                    </select>
                  </dd>
                </div>
                <DetailRow
                  label={t("settings.framesPerBurst")}
                  value={String(snapshot.perception.samplingPolicy.framesPerBurst)}
                />
                <DetailRow
                  label={t("settings.burstInterval")}
                  value={`${snapshot.perception.samplingPolicy.minimumBurstIntervalSeconds}s`}
                />
                <DetailRow
                  label={t("settings.rawRetention")}
                  value={
                    snapshot.perception.samplingPolicy.rawFrameRetention === "disabled"
                      ? t("state.disabled")
                      : `${snapshot.perception.samplingPolicy.rawFrameTtlIfEnabledMinutes}m`
                  }
                />
                <DetailRow
                  label={t("settings.protectedApps")}
                  value={String(
                    snapshot.perception.protectedApps.filter((rule) => rule.enabled).length
                  )}
                />
                <DetailRow
                  label={t("settings.policySnapshot")}
                  value={snapshot.perception.policySnapshot.id}
                />
                <DetailRow
                  label={t("settings.perceptionCpuBudget")}
                  value={`${snapshot.perception.resourcePolicy.cpu.maxCaptureDutyCyclePercent}% / ${snapshot.perception.resourcePolicy.cpu.minScreenCaptureIntervalMs}ms`}
                />
                <DetailRow
                  label={t("settings.perceptionBatteryBudget")}
                  value={`${snapshot.perception.resourcePolicy.battery.pauseBelowPercent}%`}
                />
                <DetailRow
                  label={t("settings.perceptionStorageBudget")}
                  value={`${Math.round(
                    snapshot.perception.resourcePolicy.storage.maxRawSidecarBytes / 1024 / 1024
                  )} MB / ${snapshot.perception.resourcePolicy.storage.defaultRawTtlMinutes}m`}
                />
                <DetailRow
                  label={t("settings.perceptionQueueBudget")}
                  value={`${snapshot.perception.resourcePolicy.queue.maxItems} / ${snapshot.perception.resourcePolicy.queue.drainBatchSize}`}
                />
                <DetailRow
                  label={t("settings.perceptionProviderBudget")}
                  value={`${snapshot.perception.resourcePolicy.provider.maxRequestsPerHour} / ${snapshot.perception.resourcePolicy.provider.maxTokensPerHour}`}
                />
              </dl>
            </Section>
            <Section title={t("section.auditReview")}>
              <dl className="settings-grid">
                <DetailRow
                  label={t("settings.auditReviewCoverage")}
                  value={`${snapshot.auditReview.requiredGroups.length - snapshot.auditReview.missingGroups.length}/${snapshot.auditReview.requiredGroups.length}`}
                />
                <DetailRow
                  label={t("settings.auditReviewMissing")}
                  value={
                    snapshot.auditReview.missingGroups.length > 0
                      ? snapshot.auditReview.missingGroups.join(", ")
                      : t("fallback.none")
                  }
                />
                <DetailRow
                  label={t("settings.auditReviewOperations")}
                  value={String(Object.keys(snapshot.auditReview.operationCounts).length)}
                />
              </dl>
            </Section>
          </div>
        ) : null}

        {activeSection === "runtime" ? (
          <Section title={t("section.runtime")}>
            <div className="settings-section-stack runtime-settings-panel">
              <div className="settings-policy-block screen-ocr-runtime-panel">
                <div className="settings-panel-heading">
                  <div>
                    <h3>{t("settings.screenOcrRuntimeTitle")}</h3>
                    <p>{t("settings.screenOcrRuntimeDescription")}</p>
                  </div>
                  <span className={`runtime-pill ${dogfoodRuntime.state}`}>
                    {tDogfoodRuntimeState(t, dogfoodRuntime.state)}
                  </span>
                </div>
                {dogfoodRuntime.state === "needs_permission" ? (
                  <div className="screen-ocr-onboarding">
                    <h4>{t("settings.screenOcrOnboardingTitle")}</h4>
                    <p>{t("settings.screenOcrOnboardingBody")}</p>
                    <button
                      className="secondary-button"
                      onClick={() => void onRequestScreenRecordingPermission()}
                      type="button"
                    >
                      {t("settings.screenOcrOnboardingOpenPermission")}
                    </button>
                  </div>
                ) : null}
                <dl className="mini-grid">
                  <DetailRow
                    label={t("settings.screenOcrPermission")}
                    value={dogfoodRuntime.permission}
                  />
                  <DetailRow
                    label={t("settings.screenOcrReason")}
                    value={tDogfoodRuntimeReason(t, dogfoodRuntime.reason)}
                  />
                  <DetailRow
                    label={t("settings.screenOcrNextAction")}
                    value={tDogfoodNextAction(t, dogfoodRuntime.nextAction)}
                  />
                  <DetailRow
                    label={t("settings.screenOcrLastTransition")}
                    value={dogfoodRuntime.lastTransitionAt ?? t("fallback.none")}
                  />
                  <DetailRow
                    label={t("settings.screenOcrActiveSources")}
                    value={
                      dogfoodRuntime.activeSourceKinds.length > 0
                        ? dogfoodRuntime.activeSourceKinds.map((kind) => sourceKind(kind)).join(", ")
                        : t("fallback.none")
                    }
                  />
                  <DetailRow
                    label={t("settings.screenOcrProtectedPolicy")}
                    value={t("settings.screenOcrProtectedPolicyValue")}
                  />
                </dl>
                <div className="provider-actions">
                  <button
                    className="secondary-button"
                    data-screen-ocr-action="resume"
                    disabled={!screenOcrCanResume}
                    onClick={() => {
                      void onUpdatePerceptionSourceRuntime("screen", "resume");
                      void onUpdatePerceptionSourceRuntime("ocr", "resume");
                    }}
                    type="button"
                  >
                    {t("action.resume")}
                  </button>
                  <button
                    className="secondary-button"
                    data-screen-ocr-action="pause"
                    disabled={!screenOcrCanPause}
                    onClick={() => {
                      void onUpdatePerceptionSourceRuntime("screen", "pause");
                      void onUpdatePerceptionSourceRuntime("ocr", "pause");
                    }}
                    type="button"
                  >
                    {t("action.pause")}
                  </button>
                  <button
                    className="secondary-button"
                    data-screen-ocr-action="stop"
                    disabled={dogfoodRuntime.state === "stopped"}
                    onClick={() => {
                      void onUpdatePerceptionSourceRuntime("screen", "disable");
                      void onUpdatePerceptionSourceRuntime("ocr", "disable");
                    }}
                    type="button"
                  >
                    {t("action.stopScreenOcr")}
                  </button>
                  <button
                    className="secondary-button"
                    data-screen-ocr-action="capture"
                    disabled={dogfoodRuntime.state !== "observing"}
                    onClick={() => void onCaptureScreenOcrBurst()}
                    type="button"
                  >
                    {t("action.captureScreenOcrBurst")}
                  </button>
                  <button
                    className="secondary-button"
                    data-screen-ocr-action="cleanup"
                    onClick={() => void onCleanupPerceptionSidecars()}
                    type="button"
                  >
                    {t("action.cleanupPerceptionSidecars")}
                  </button>
                </div>
                <p className="muted">{t("settings.screenOcrRuntimeNote")}</p>
              </div>

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
                        onChange={(event) =>
                          void onSetCollectionPaused(!event.currentTarget.checked)
                        }
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
                          void onUpdateSetting(
                            "desktop.menuBarEnabled",
                            event.currentTarget.checked
                          )
                        }
                        type="checkbox"
                      />
                      <span>
                        {snapshot.settings.menuBarEnabled
                          ? t("state.enabled")
                          : t("state.disabled")}
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
            <div className="settings-policy-block observation-settings-panel">
              <h3>{t("settings.observationTitle")}</h3>
              <dl className="mini-grid">
                <DetailRow
                  label={t("settings.observationStatus")}
                  value={tObservationStatus(t, snapshot.observation.status)}
                />
                <DetailRow
                  label={t("settings.observationTier1")}
                  value={
                    snapshot.observation.tiers.tier1.enabled
                      ? t("state.enabled")
                      : t("state.disabled")
                  }
                />
                <DetailRow
                  label={t("settings.observationLastEvent")}
                  value={snapshot.observation.lastEventAt ?? t("fallback.none")}
                />
                <DetailRow
                  label={t("settings.observationProtectedApps")}
                  value={String(
                    snapshot.observation.protectedApps.filter((rule) => rule.enabled).length
                  )}
                />
                <DetailRow
                  label={t("settings.observationTier2")}
                  value={t("settings.observationTier2Disabled")}
                />
                <DetailRow
                  label={t("settings.observationTier3")}
                  value={t("settings.observationTier3Disabled")}
                />
              </dl>
              <div className="provider-actions">
                <button
                  className="secondary-button"
                  data-observation-action={snapshot.observation.enabled ? "resume" : "start"}
                  disabled={snapshot.observation.enabled && !snapshot.observation.paused}
                  onClick={() =>
                    void (snapshot.observation.enabled
                      ? onResumeObservation()
                      : onStartObservation())
                  }
                  type="button"
                >
                  {snapshot.observation.enabled ? t("action.resume") : t("action.startObservation")}
                </button>
                <button
                  className="secondary-button"
                  data-observation-action="pause"
                  disabled={!snapshot.observation.enabled || snapshot.observation.paused}
                  onClick={() => void onPauseObservation()}
                  type="button"
                >
                  {t("action.pause")}
                </button>
                <button
                  className="secondary-button"
                  data-observation-action="stop"
                  disabled={!snapshot.observation.enabled}
                  onClick={() => void onStopObservation()}
                  type="button"
                >
                  {t("action.stopObservation")}
                </button>
              </div>
              <p className="muted">{t("settings.observationNote")}</p>
            </div>
            <div className="settings-policy-block background-runtime-panel">
              <h3>{t("settings.backgroundScheduler")}</h3>
              <dl className="mini-grid">
                <DetailRow
                  label={t("settings.backgroundSourceBudget")}
                  value={String(snapshot.runtime.background.policy.maxSourcesPerCycle)}
                />
                <DetailRow
                  label={t("settings.backgroundResourceLimits")}
                  value={
                    snapshot.runtime.background.policy.resourceLimits.lowPowerMode
                      ? t("runtime.resourceLimited")
                      : t("runtime.resourceNormal")
                  }
                />
                <DetailRow
                  label={t("settings.backgroundQueueBudget")}
                  value={`${snapshot.runtime.background.policy.resourceLimits.maxReadPerCycle} / ${snapshot.runtime.background.policy.resourceLimits.maxInsertedPerCycle}`}
                />
                <DetailRow
                  label={t("settings.backgroundSourceStates")}
                  value={String(snapshot.runtime.background.sources.length)}
                />
              </dl>
              <div className="source-policy-list runtime-source-state-list">
                {snapshot.runtime.background.sources.map((source) => (
                  <article className="source-policy-row" key={source.sourceId}>
                    <div>
                      <h3>{source.displayName}</h3>
                      <p>{`${sourceKind(source.sourceKind)} · ${runtimeSourceStatusLabel(
                        t,
                        source.status
                      )}`}</p>
                    </div>
                    <div className="source-policy-badges">
                      <span>{`${t("source.runtimeInterval")} ${formatDuration(
                        source.intervalMs
                      )}`}</span>
                      <span>{`${t("source.runtimeNextRun")} ${
                        source.nextRunAt ?? t("fallback.none")
                      }`}</span>
                      {source.backoffUntil ? (
                        <span>{`${t("source.runtimeBackoff")} ${source.backoffUntil}`}</span>
                      ) : null}
                      {source.lastError ? <span>{source.lastError}</span> : null}
                    </div>
                  </article>
                ))}
                {snapshot.runtime.background.sources.length === 0 ? (
                  <div className="empty-state compact">{t("empty.noSources")}</div>
                ) : null}
              </div>
            </div>
            </div>
          </Section>
        ) : null}

        {activeSection === "indexing" ? (
          <div className="settings-section-stack index-settings-panel">
            <Section title={t("section.indexStatus")}>
              <dl className="settings-grid">
                <DetailRow label={t("settings.eventStore")} value="SQLite WAL" />
                <DetailRow
                  label={t("settings.knowledgeFts")}
                  value={`${snapshot.knowledgeArtifacts.length} ${t("unit.knowledgeArtifacts")}`}
                />
                <DetailRow
                  label={t("settings.memoryFts")}
                  value={`${snapshot.memories.length} ${t("unit.memories")}`}
                />
                <DetailRow
                  label={t("settings.vectorIndex")}
                  value={t("settings.vectorIndexDisabled")}
                />
                <DetailRow
                  label={t("settings.embeddingProvider")}
                  value={t("settings.embeddingProviderDisabled")}
                />
                <DetailRow
                  label={t("settings.reindexPolicy")}
                  value={t("settings.reindexIdempotent")}
                />
              </dl>
            </Section>
            <Section title={t("section.agentInterface")}>
              <dl className="settings-grid">
                <DetailRow
                  label={t("settings.agentInterfaceMode")}
                  value={t("settings.agentInterfaceReadOnly")}
                />
                <DetailRow
                  label={t("settings.defaultKnowledgeContext")}
                  value={`${confirmedKnowledgeCount} ${t("state.enabled")} · ${blockedKnowledgeCount} ${t(
                    "settings.blockedUntilReview"
                  )}`}
                />
                <DetailRow
                  label={t("settings.defaultMemoryContext")}
                  value={`${confirmedMemoryCount} ${t("state.enabled")} · ${blockedMemoryCount} ${t(
                    "settings.blockedUntilReview"
                  )}`}
                />
                <DetailRow
                  label={t("settings.handoffBoundary")}
                  value={t("settings.handoffBoundaryConfirmedOnly")}
                />
                <DetailRow
                  label={t("settings.agentContextRawData")}
                  value={t("settings.agentContextNoRawData")}
                />
              </dl>
            </Section>
          </div>
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
            <div className="settings-operation-list">
              <article className="settings-operation">
                <div>
                  <h3>{t("action.reindex")}</h3>
                  <p>{t("settings.reindexDescription")}</p>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => void onReindexLocalData()}
                  type="button"
                >
                  {t("action.reindex")}
                </button>
              </article>
              <article className="settings-operation">
                <div>
                  <h3>{t("action.exportContext")}</h3>
                  <p>{t("settings.exportDescription")}</p>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => void onExportContext()}
                  type="button"
                >
                  {t("action.exportContext")}
                </button>
              </article>
              <article className="settings-operation danger-operation">
                <div>
                  <h3>{t("action.clearLocalData")}</h3>
                  <p>{t("settings.clearDataDescription")}</p>
                </div>
                <button
                  className="danger-button"
                  onClick={() => void clearLocalData()}
                  type="button"
                >
                  {t("action.clearLocalData")}
                </button>
              </article>
            </div>
          </Section>
        ) : null}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PolicyToggle({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange(checked: boolean): void;
}): ReactElement {
  return (
    <label className="policy-toggle">
      <input
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  );
}

function countSummary(count: number, total: number): string {
  return `${count}/${total}`;
}

function readPermissionStatus(
  snapshot: DesktopSnapshot,
  kind: "screen" | "microphone" | "system_audio"
): string {
  const gate = snapshot.perception.sources
    .flatMap((source) => source.permissionGates)
    .find((permission) => permission.kind === kind);
  return gate?.status ?? "not_required";
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function providerBoundaryValue(
  t: ReturnType<typeof useI18n>["t"],
  providerKind: DesktopAIProviderKind
): string {
  if (providerKind === "disabled") return t("settings.providerTaskDisabled");
  return t("settings.providerTaskExternalDrafting");
}

function perceptionProviderTaskLabel(
  t: ReturnType<typeof useI18n>["t"],
  task: PerceptionProviderTask
): string {
  if (task === "vision") return t("perception.providerTaskVision");
  if (task === "transcription") return t("perception.providerTaskTranscription");
  return t("perception.providerTaskOcr");
}

function providerRuntimeTaskLabel(
  t: ReturnType<typeof useI18n>["t"],
  task: DesktopSnapshot["aiProviderRuntime"]["tasks"][number]["task"]
): string {
  if (task === "knowledge_draft") return t("providerRuntime.taskKnowledgeDraft");
  if (task === "vision_summary") return t("providerRuntime.taskVisionSummary");
  if (task === "ocr_postprocess") return t("providerRuntime.taskOcrPostprocess");
  if (task === "transcription") return t("providerRuntime.taskTranscription");
  if (task === "memory_candidate") return t("providerRuntime.taskMemoryCandidate");
  if (task === "recommendation") return t("providerRuntime.taskRecommendation");
  return t("providerRuntime.taskContextCompression");
}

function providerRuntimeStateLabel(
  t: ReturnType<typeof useI18n>["t"],
  state: DesktopSnapshot["aiProviderRuntime"]["tasks"][number]["state"]
): string {
  if (state === "ready") return t("providerRuntime.stateReady");
  if (state === "skipped_by_policy") return t("providerRuntime.stateSkippedByPolicy");
  if (state === "missing_configuration") return t("providerRuntime.stateMissingConfiguration");
  if (state === "not_implemented") return t("providerRuntime.stateNotImplemented");
  return t("providerRuntime.stateDisabled");
}

function providerKindLabel(
  t: ReturnType<typeof useI18n>["t"],
  providerKind: DesktopSnapshot["aiProviderRuntime"]["tasks"][number]["providerKind"]
): string {
  if (providerKind === "local") return t("provider.local");
  if (providerKind === "openai-compatible") return t("provider.openaiCompatible");
  return t("provider.disabled");
}

function runtimeSourceStatusLabel(
  t: ReturnType<typeof useI18n>["t"],
  status: DesktopSnapshot["runtime"]["background"]["sources"][number]["status"]
): string {
  if (status === "disabled") return t("state.disabled");
  if (status === "paused") return t("runtime.paused");
  if (status === "backoff") return t("runtime.backoff");
  if (status === "error") return t("runtime.error");
  return t("runtime.scheduled");
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

function tObservationStatus(
  t: ReturnType<typeof useI18n>["t"],
  status: DesktopSnapshot["observation"]["status"]
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

function tDogfoodRuntimeState(
  t: ReturnType<typeof useI18n>["t"],
  state: DesktopSnapshot["perception"]["dogfoodRuntime"]["state"]
): string {
  return t(`dogfoodRuntime.${state}` as Parameters<typeof t>[0]);
}

function tDogfoodRuntimeReason(
  t: ReturnType<typeof useI18n>["t"],
  reason: DesktopSnapshot["perception"]["dogfoodRuntime"]["reason"]
): string {
  return t(`dogfoodReason.${reason}` as Parameters<typeof t>[0]);
}

function tDogfoodNextAction(
  t: ReturnType<typeof useI18n>["t"],
  nextAction: DesktopSnapshot["perception"]["dogfoodRuntime"]["nextAction"]
): string {
  return t(`dogfoodNextAction.${nextAction}` as Parameters<typeof t>[0]);
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
