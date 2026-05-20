import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import {
  Activity,
  BookOpen,
  Brain,
  CheckSquare,
  Database,
  Lightbulb,
  RefreshCw,
  Settings,
  Sparkles
} from "lucide-react";
import type { DesktopSnapshot } from "./orbitApi";
import type { DesktopSettingKey, SourceSetupKind } from "./orbitApi";
import type {
  KnowledgeReviewAction,
  MemoryReviewAction,
  RecommendationReviewAction
} from "@orbit/db";
import { ActivityPage } from "./routes/ActivityPage";
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
  | "review"
  | "sources"
  | "settings";

const pages = [
  { id: "today", labelKey: "nav.today", icon: Sparkles },
  { id: "activity", labelKey: "nav.activity", icon: Activity },
  { id: "knowledge", labelKey: "nav.knowledge", icon: BookOpen },
  { id: "memory", labelKey: "nav.memory", icon: Brain },
  { id: "recommendations", labelKey: "nav.recommendations", icon: Lightbulb },
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
  const { t } = createI18n(language);

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

  async function reindexLocalData(): Promise<void> {
    await runDesktopAction(() => window.orbit.reindexLocalData(), t("error.reindex"));
  }

  async function clearLocalData(): Promise<void> {
    await runDesktopAction(() => window.orbit.clearLocalData(), t("error.clear"));
  }

  async function exportContext(): Promise<void> {
    await runDesktopAction(() => window.orbit.exportContext(), t("error.export"));
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

  function reviewMemory(id: string, action: MemoryReviewAction): Promise<void> {
    return runReviewAction(
      () => window.orbit.reviewMemory(id, action),
      t("error.memoryReview")
    );
  }

  function reviewRecommendation(id: string, action: RecommendationReviewAction): Promise<void> {
    return runReviewAction(
      () => window.orbit.reviewRecommendation(id, action),
      t("error.recommendationReview")
    );
  }

  useEffect(() => {
    void loadSnapshot();
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
          <span className="status-dot" />
          <span>
            {snapshot?.settings.localOnly ? t("app.localOnly") : t("app.remoteEnabled")}
          </span>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{pageTitle}</h1>
            <p>{snapshot?.date ?? t("app.loadingContext")}</p>
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
              reviewMemory,
              reviewRecommendation,
              updateSetting,
              setupSource,
              reindexLocalData,
              clearLocalData,
              exportContext
            })
          : null}
      </main>
      </div>
    </I18nProvider>
  );
}

interface PageActions {
  reviewKnowledge(id: string, action: KnowledgeReviewAction): Promise<void>;
  reviewMemory(id: string, action: MemoryReviewAction): Promise<void>;
  reviewRecommendation(id: string, action: RecommendationReviewAction): Promise<void>;
  updateSetting(key: DesktopSettingKey, value: unknown): Promise<void>;
  setupSource(kind: SourceSetupKind, path?: string): Promise<void>;
  reindexLocalData(): Promise<void>;
  clearLocalData(): Promise<void>;
  exportContext(): Promise<void>;
}

function renderPage(page: PageId, snapshot: DesktopSnapshot, actions: PageActions): ReactElement {
  switch (page) {
    case "today":
      return <TodayPage snapshot={snapshot} />;
    case "activity":
      return <ActivityPage sessions={snapshot.activitySessions} />;
    case "knowledge":
      return <KnowledgePage artifacts={snapshot.knowledgeArtifacts} />;
    case "memory":
      return <MemoryPage memories={snapshot.memories} />;
    case "recommendations":
      return (
        <RecommendationsPage
          recommendations={snapshot.recommendations}
          onReviewRecommendation={actions.reviewRecommendation}
        />
      );
    case "review":
      return (
        <ReviewQueuePage
          snapshot={snapshot}
          onReviewKnowledge={actions.reviewKnowledge}
          onReviewMemory={actions.reviewMemory}
        />
      );
    case "sources":
      return <SourcesPage snapshot={snapshot} onSetupSource={actions.setupSource} />;
    case "settings":
      return (
        <SettingsPage
          snapshot={snapshot}
          onClearLocalData={actions.clearLocalData}
          onExportContext={actions.exportContext}
          onReindexLocalData={actions.reindexLocalData}
          onUpdateSetting={actions.updateSetting}
        />
      );
  }
}
