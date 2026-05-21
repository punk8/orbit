import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import {
  Activity,
  BookOpen,
  Brain,
  CheckSquare,
  Database,
  FileText,
  Lightbulb,
  RefreshCw,
  Settings,
  Sparkles
} from "lucide-react";
import type { DesktopSnapshot } from "./orbitApi";
import type {
  DesktopAIProviderTestConfig,
  DesktopAIProviderTestResult,
  DesktopHandoffResult,
  DesktopSettingKey,
  DesktopSourceRuntimeAction,
  SourceSetupKind
} from "./orbitApi";
import type {
  PerceptionProviderKind,
  PerceptionProviderTask,
  PerceptionSourceKind,
  PerceptionSourcePolicyPatch,
  PerceptionSourceRuntimeAction
} from "@orbit/core";
import type {
  KnowledgeEditInput,
  KnowledgeReviewAction,
  MemoryEditInput,
  MemoryReviewAction,
  RecommendationReviewAction
} from "@orbit/db";
import { ActivityPage } from "./routes/ActivityPage";
import { HandoffPage } from "./routes/HandoffPage";
import { KnowledgePage } from "./routes/KnowledgePage";
import { MemoryPage } from "./routes/MemoryPage";
import { RecommendationsPage } from "./routes/RecommendationsPage";
import { ReviewQueuePage } from "./routes/ReviewQueuePage";
import { SettingsPage } from "./routes/SettingsPage";
import { SourcesPage } from "./routes/SourcesPage";
import { TodayPage } from "./routes/TodayPage";
import { I18nProvider, createI18n, getEffectiveLanguage } from "./i18n";
import type { TranslationKey } from "./i18n";

type PageId =
  | "today"
  | "activity"
  | "knowledge"
  | "memory"
  | "recommendations"
  | "handoff"
  | "review"
  | "sources"
  | "settings";

const pages = [
  { id: "today", labelKey: "nav.today", icon: Sparkles },
  { id: "activity", labelKey: "nav.activity", icon: Activity },
  { id: "knowledge", labelKey: "nav.knowledge", icon: BookOpen },
  { id: "memory", labelKey: "nav.memory", icon: Brain },
  { id: "recommendations", labelKey: "nav.recommendations", icon: Lightbulb },
  { id: "handoff", labelKey: "nav.handoff", icon: FileText },
  { id: "review", labelKey: "nav.review", icon: CheckSquare },
  { id: "sources", labelKey: "nav.sources", icon: Database },
  { id: "settings", labelKey: "nav.settings", icon: Settings }
] satisfies Array<{ id: PageId; labelKey: TranslationKey; icon: typeof Sparkles }>;

export function App(): ReactElement {
  const [activePage, setActivePage] = useState<PageId>("today");
  const [snapshot, setSnapshot] = useState<DesktopSnapshot | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const language = getEffectiveLanguage(snapshot?.settings.language);
  const { t, formatDate } = createI18n(language);

  async function loadSnapshot(): Promise<void> {
    setIsLoading(true);
    setError(undefined);
    setNotice(undefined);
    try {
      setSnapshot(await window.orbit.getSnapshot());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error.load"));
    } finally {
      setIsLoading(false);
    }
  }

  async function runReviewAction(
    work: () => Promise<DesktopSnapshot>,
    failureMessage: string
  ): Promise<void> {
    setError(undefined);
    try {
      setSnapshot(await work());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : failureMessage);
    }
  }

  async function updateSetting(key: DesktopSettingKey, value: unknown): Promise<void> {
    await runReviewAction(() => window.orbit.updateSetting(key, value), t("error.setting"));
  }

  async function setCollectionPaused(paused: boolean): Promise<void> {
    await runReviewAction(() => window.orbit.setCollectionPaused(paused), t("error.setting"));
  }

  async function startObservation(): Promise<void> {
    await runReviewAction(() => window.orbit.startObservation(), t("error.observation"));
  }

  async function pauseObservation(): Promise<void> {
    await runReviewAction(() => window.orbit.pauseObservation(), t("error.observation"));
  }

  async function resumeObservation(): Promise<void> {
    await runReviewAction(() => window.orbit.resumeObservation(), t("error.observation"));
  }

  async function stopObservation(): Promise<void> {
    await runReviewAction(() => window.orbit.stopObservation(), t("error.observation"));
  }

  async function updateSourceRuntime(
    sourceId: string,
    action: DesktopSourceRuntimeAction
  ): Promise<void> {
    await runReviewAction(
      () => window.orbit.updateSourceRuntime(sourceId, action),
      t("error.sourceRuntime")
    );
  }

  async function updatePerceptionSourceRuntime(
    sourceKind: PerceptionSourceKind,
    action: PerceptionSourceRuntimeAction
  ): Promise<void> {
    await runReviewAction(
      () => window.orbit.updatePerceptionSourceRuntime(sourceKind, action),
      t("error.perception")
    );
  }

  async function updatePerceptionSourcePolicy(
    sourceKind: PerceptionSourceKind,
    patch: PerceptionSourcePolicyPatch
  ): Promise<void> {
    await runReviewAction(
      () => window.orbit.updatePerceptionSourcePolicy(sourceKind, patch),
      t("error.perception")
    );
  }

  async function updatePerceptionProviderRoute(
    task: PerceptionProviderTask,
    provider: PerceptionProviderKind
  ): Promise<void> {
    await runReviewAction(
      () => window.orbit.updatePerceptionProviderRoute(task, provider),
      t("error.perception")
    );
  }

  async function setupSource(kind: SourceSetupKind, path?: string): Promise<void> {
    setError(undefined);
    try {
      const result = await window.orbit.setupSource(kind, path);
      setSnapshot(result.snapshot);
      setNotice(
        result.warnings?.length ? `${result.message}; ${result.warnings[0]}` : result.message
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error.source"));
    }
  }

  async function reconfigureSource(
    sourceId: string,
    kind: SourceSetupKind,
    path?: string
  ): Promise<void> {
    await runDesktopAction(
      () => window.orbit.reconfigureSource(sourceId, kind, path),
      t("error.sourceRuntime")
    );
  }

  async function deleteSource(sourceId: string): Promise<void> {
    await runDesktopAction(() => window.orbit.deleteSource(sourceId), t("error.sourceRuntime"));
  }

  async function resetSourceCursor(sourceId: string): Promise<void> {
    await runDesktopAction(
      () => window.orbit.resetSourceCursor(sourceId),
      t("error.sourceRuntime")
    );
  }

  async function cleanupLegacyEventPrivacy(): Promise<void> {
    await runDesktopAction(
      () => window.orbit.cleanupLegacyEventPrivacy(),
      t("error.sourceRuntime")
    );
  }

  async function cleanupPerceptionSidecars(): Promise<void> {
    await runDesktopAction(
      () => window.orbit.cleanupPerceptionSidecars(),
      t("error.sourceRuntime")
    );
  }

  async function captureScreenOcr(): Promise<void> {
    await runDesktopAction(() => window.orbit.captureScreenOcr(), t("error.perceptionCapture"));
  }

  async function reindexLocalData(): Promise<void> {
    await runDesktopAction(() => window.orbit.reindexLocalData(), t("error.reindex"));
  }

  async function clearLocalData(): Promise<void> {
    await runDesktopAction(() => window.orbit.clearLocalData(), t("error.clear"));
  }

  async function exportContext(): Promise<void> {
    await runDesktopAction(() => window.orbit.exportContext(), t("error.export"));
  }

  async function generateHandoff(
    input: { kind: "today"; date?: string } | { kind: "project"; project: string }
  ): Promise<DesktopHandoffResult> {
    return window.orbit.generateHandoff(input);
  }

  async function testAIProvider(
    config: DesktopAIProviderTestConfig
  ): Promise<DesktopAIProviderTestResult> {
    return window.orbit.testAIProvider(config);
  }

  async function runDesktopAction(
    work: () => Promise<{ snapshot: DesktopSnapshot; message: string; exportPath?: string }>,
    failureMessage: string
  ): Promise<void> {
    setError(undefined);
    try {
      const result = await work();
      setSnapshot(result.snapshot);
      setNotice(result.exportPath ? `${result.message}` : result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : failureMessage);
    }
  }

  function reviewKnowledge(id: string, action: KnowledgeReviewAction): Promise<void> {
    return runReviewAction(
      () => window.orbit.reviewKnowledge(id, action),
      t("error.knowledgeReview")
    );
  }

  function editKnowledge(id: string, patch: KnowledgeEditInput): Promise<void> {
    return runReviewAction(() => window.orbit.editKnowledge(id, patch), t("error.knowledgeEdit"));
  }

  function reviewMemory(id: string, action: MemoryReviewAction): Promise<void> {
    return runReviewAction(() => window.orbit.reviewMemory(id, action), t("error.memoryReview"));
  }

  function editMemory(id: string, patch: MemoryEditInput): Promise<void> {
    return runReviewAction(() => window.orbit.editMemory(id, patch), t("error.memoryEdit"));
  }

  function reviewRecommendation(
    id: string,
    action: RecommendationReviewAction,
    options?: { snoozeUntil?: string | undefined }
  ): Promise<void> {
    return runReviewAction(
      () => window.orbit.reviewRecommendation(id, action, options),
      t("error.recommendationReview")
    );
  }

  useEffect(() => {
    void loadSnapshot();
  }, []);

  useEffect(() => {
    return window.orbit.onSnapshotChanged(() => {
      void loadSnapshot();
    });
  }, []);

  const pageTitle = useMemo(
    () => t(pages.find((page) => page.id === activePage)?.labelKey ?? "nav.today"),
    [activePage, t]
  );

  return (
    <I18nProvider language={language}>
      <div className="app-shell" lang={language}>
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">O</div>
            <div>
              <div className="brand-name">Orbit</div>
              <div className="brand-subtitle">{t("app.brandSubtitle")}</div>
            </div>
          </div>
          <nav className="nav-list" aria-label={t("aria.views")}>
            {pages.map((page) => {
              const Icon = page.icon;
              const label = t(page.labelKey);
              return (
                <button
                  className={`nav-item ${activePage === page.id ? "active" : ""}`}
                  data-page-id={page.id}
                  key={page.id}
                  onClick={() => setActivePage(page.id)}
                  title={label}
                  type="button"
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
          <div className="sidebar-footer">
            <span className={`status-dot ${snapshot?.runtime.status ?? "idle"}`} />
            <span>
              {snapshot ? tRuntimeStatus(t, snapshot.runtime.status) : t("app.localOnly")}
            </span>
          </div>
        </aside>

        <main className="workspace">
          <header className="topbar">
            <div>
              <h1>{pageTitle}</h1>
              <p>{snapshot ? formatDate(snapshot.date) : t("app.loadingContext")}</p>
            </div>
            <button
              className="icon-button"
              onClick={() => void loadSnapshot()}
              title={t("app.refresh")}
              type="button"
            >
              <RefreshCw size={17} aria-hidden="true" />
            </button>
          </header>

          {error ? <div className="error-banner">{error}</div> : null}
          {notice ? <div className="notice-banner">{notice}</div> : null}
          {isLoading && !snapshot ? <div className="empty-state">{t("app.loading")}</div> : null}
          {snapshot
            ? renderPage(activePage, snapshot, {
                reviewKnowledge,
                editKnowledge,
                reviewMemory,
                editMemory,
                reviewRecommendation,
                updateSetting,
                setCollectionPaused,
                startObservation,
                pauseObservation,
                resumeObservation,
                stopObservation,
                updateSourceRuntime,
                updatePerceptionSourceRuntime,
                updatePerceptionSourcePolicy,
                updatePerceptionProviderRoute,
                setupSource,
                reconfigureSource,
                deleteSource,
                resetSourceCursor,
                cleanupLegacyEventPrivacy,
                cleanupPerceptionSidecars,
                captureScreenOcr,
                reindexLocalData,
                clearLocalData,
                exportContext,
                generateHandoff,
                testAIProvider
              })
            : null}
        </main>
      </div>
    </I18nProvider>
  );
}

function tRuntimeStatus(
  t: ReturnType<typeof createI18n>["t"],
  status: DesktopSnapshot["runtime"]["status"]
): string {
  if (status === "collecting") return t("runtime.collecting");
  if (status === "paused") return t("runtime.paused");
  if (status === "error") return t("runtime.error");
  return t("runtime.idle");
}

interface PageActions {
  reviewKnowledge(id: string, action: KnowledgeReviewAction): Promise<void>;
  editKnowledge(id: string, patch: KnowledgeEditInput): Promise<void>;
  reviewMemory(id: string, action: MemoryReviewAction): Promise<void>;
  editMemory(id: string, patch: MemoryEditInput): Promise<void>;
  reviewRecommendation(
    id: string,
    action: RecommendationReviewAction,
    options?: { snoozeUntil?: string | undefined }
  ): Promise<void>;
  updateSetting(key: DesktopSettingKey, value: unknown): Promise<void>;
  setCollectionPaused(paused: boolean): Promise<void>;
  startObservation(): Promise<void>;
  pauseObservation(): Promise<void>;
  resumeObservation(): Promise<void>;
  stopObservation(): Promise<void>;
  updateSourceRuntime(sourceId: string, action: DesktopSourceRuntimeAction): Promise<void>;
  updatePerceptionSourceRuntime(
    sourceKind: PerceptionSourceKind,
    action: PerceptionSourceRuntimeAction
  ): Promise<void>;
  updatePerceptionSourcePolicy(
    sourceKind: PerceptionSourceKind,
    patch: PerceptionSourcePolicyPatch
  ): Promise<void>;
  updatePerceptionProviderRoute(
    task: PerceptionProviderTask,
    provider: PerceptionProviderKind
  ): Promise<void>;
  setupSource(kind: SourceSetupKind, path?: string): Promise<void>;
  reconfigureSource(sourceId: string, kind: SourceSetupKind, path?: string): Promise<void>;
  deleteSource(sourceId: string): Promise<void>;
  resetSourceCursor(sourceId: string): Promise<void>;
  cleanupLegacyEventPrivacy(): Promise<void>;
  cleanupPerceptionSidecars(): Promise<void>;
  captureScreenOcr(): Promise<void>;
  reindexLocalData(): Promise<void>;
  clearLocalData(): Promise<void>;
  exportContext(): Promise<void>;
  generateHandoff(
    input: { kind: "today"; date?: string } | { kind: "project"; project: string }
  ): Promise<DesktopHandoffResult>;
  testAIProvider(config: DesktopAIProviderTestConfig): Promise<DesktopAIProviderTestResult>;
}

function renderPage(page: PageId, snapshot: DesktopSnapshot, actions: PageActions): ReactElement {
  switch (page) {
    case "today":
      return <TodayPage snapshot={snapshot} />;
    case "activity":
      return (
        <ActivityPage
          sessions={snapshot.activitySessions}
          onCaptureScreenOcr={actions.captureScreenOcr}
        />
      );
    case "knowledge":
      return (
        <KnowledgePage
          artifacts={snapshot.knowledgeArtifacts}
          onEditKnowledge={actions.editKnowledge}
          onReviewKnowledge={actions.reviewKnowledge}
        />
      );
    case "memory":
      return (
        <MemoryPage
          memories={snapshot.memories}
          onEditMemory={actions.editMemory}
          onReviewMemory={actions.reviewMemory}
        />
      );
    case "recommendations":
      return (
        <RecommendationsPage
          recommendations={snapshot.recommendations}
          onReviewRecommendation={actions.reviewRecommendation}
        />
      );
    case "handoff":
      return <HandoffPage snapshot={snapshot} onGenerateHandoff={actions.generateHandoff} />;
    case "review":
      return (
        <ReviewQueuePage
          snapshot={snapshot}
          onReviewKnowledge={actions.reviewKnowledge}
          onReviewMemory={actions.reviewMemory}
        />
      );
    case "sources":
      return (
        <SourcesPage
          snapshot={snapshot}
          onSetupSource={actions.setupSource}
          onReconfigureSource={actions.reconfigureSource}
          onDeleteSource={actions.deleteSource}
          onResetSourceCursor={actions.resetSourceCursor}
          onCleanupLegacyEventPrivacy={actions.cleanupLegacyEventPrivacy}
          onCleanupPerceptionSidecars={actions.cleanupPerceptionSidecars}
          onUpdateSourceRuntime={actions.updateSourceRuntime}
          onUpdatePerceptionSourceRuntime={actions.updatePerceptionSourceRuntime}
        />
      );
    case "settings":
      return (
        <SettingsPage
          snapshot={snapshot}
          onClearLocalData={actions.clearLocalData}
          onExportContext={actions.exportContext}
          onReindexLocalData={actions.reindexLocalData}
          onTestAIProvider={actions.testAIProvider}
          onSetCollectionPaused={actions.setCollectionPaused}
          onStartObservation={actions.startObservation}
          onPauseObservation={actions.pauseObservation}
          onResumeObservation={actions.resumeObservation}
          onStopObservation={actions.stopObservation}
          onUpdateSetting={actions.updateSetting}
          onUpdatePerceptionSourcePolicy={actions.updatePerceptionSourcePolicy}
          onUpdatePerceptionProviderRoute={actions.updatePerceptionProviderRoute}
        />
      );
  }
}
