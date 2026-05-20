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
  { id: "today", label: "Today", icon: Sparkles },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "recommendations", label: "Recommendations", icon: Lightbulb },
  { id: "review", label: "Review Queue", icon: CheckSquare },
  { id: "sources", label: "Sources", icon: Database },
  { id: "settings", label: "Settings", icon: Settings }
] satisfies Array<{ id: PageId; label: string; icon: typeof Sparkles }>;

export function App(): ReactElement {
  const [activePage, setActivePage] = useState<PageId>("today");
  const [snapshot, setSnapshot] = useState<DesktopSnapshot | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  async function loadSnapshot(): Promise<void> {
    setIsLoading(true);
    setError(undefined);
    setNotice(undefined);
    try {
      setSnapshot(await window.orbit.getSnapshot());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load Orbit data");
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
    await runReviewAction(() => window.orbit.updateSetting(key, value), "Unable to update setting");
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
      setError(reason instanceof Error ? reason.message : "Unable to configure source");
    }
  }

  async function reindexLocalData(): Promise<void> {
    await runDesktopAction(() => window.orbit.reindexLocalData(), "Unable to re-index local data");
  }

  async function clearLocalData(): Promise<void> {
    await runDesktopAction(() => window.orbit.clearLocalData(), "Unable to clear local data");
  }

  async function exportContext(): Promise<void> {
    await runDesktopAction(() => window.orbit.exportContext(), "Unable to export context");
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
      "Unable to update knowledge review state"
    );
  }

  function reviewMemory(id: string, action: MemoryReviewAction): Promise<void> {
    return runReviewAction(
      () => window.orbit.reviewMemory(id, action),
      "Unable to update memory review state"
    );
  }

  function reviewRecommendation(id: string, action: RecommendationReviewAction): Promise<void> {
    return runReviewAction(
      () => window.orbit.reviewRecommendation(id, action),
      "Unable to update recommendation state"
    );
  }

  useEffect(() => {
    void loadSnapshot();
  }, []);

  const pageTitle = useMemo(
    () => pages.find((page) => page.id === activePage)?.label ?? "Orbit",
    [activePage]
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">O</div>
          <div>
            <div className="brand-name">Orbit</div>
            <div className="brand-subtitle">Local context system</div>
          </div>
        </div>
        <nav className="nav-list" aria-label="Orbit views">
          {pages.map((page) => {
            const Icon = page.icon;
            return (
              <button
                className={`nav-item ${activePage === page.id ? "active" : ""}`}
                key={page.id}
                onClick={() => setActivePage(page.id)}
                title={page.label}
                type="button"
              >
                <Icon size={17} aria-hidden="true" />
                <span>{page.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />
          <span>{snapshot?.settings.localOnly ? "Local only" : "Remote enabled"}</span>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{pageTitle}</h1>
            <p>{snapshot?.date ?? "Loading local context"}</p>
          </div>
          <button
            className="icon-button"
            onClick={() => void loadSnapshot()}
            title="Refresh"
            type="button"
          >
            <RefreshCw size={17} aria-hidden="true" />
          </button>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}
        {notice ? <div className="notice-banner">{notice}</div> : null}
        {isLoading && !snapshot ? <div className="empty-state">Loading</div> : null}
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
