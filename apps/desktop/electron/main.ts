import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage } from "electron";
import { join } from "node:path";
import {
  cleanupLegacyEventPrivacyForDesktop,
  clearLocalDataForDesktop,
  deleteSourceForDesktop,
  editKnowledgeForDesktop,
  editMemoryForDesktop,
  exportContextForDesktop,
  generateHandoffForDesktop,
  getActivitySessionDetailForDesktop,
  getKnowledgeArtifactDetailForDesktop,
  getMemoryDetailForDesktop,
  getRecommendationDetailForDesktop,
  readDesktopSnapshot,
  readDesktopSettings,
  reconfigureSourceForDesktop,
  reindexForDesktop,
  resetSourceCursorForDesktop,
  reviewKnowledgeForDesktop,
  reviewMemoryForDesktop,
  reviewRecommendationForDesktop,
  runBackgroundIngestionForDesktop,
  setCollectionPausedForDesktop,
  searchKnowledgeForDesktop,
  searchMemoryForDesktop,
  setupSourceForDesktop,
  testAIProviderForDesktop,
  updateSourceRuntimeForDesktop,
  updateSettingForDesktop
} from "./data";

const currentDir = __dirname;
const backgroundIngestionIntervalMs = 60_000;
let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let backgroundIngestionTimer: NodeJS.Timeout | undefined;
let backgroundIngestionRunning = false;

async function createMainWindow(): Promise<BrowserWindow> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    return mainWindow;
  }

  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    title: "Orbit",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f8f7f4",
    webPreferences: {
      preload: join(currentDir, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow = window;
  window.on("closed", () => {
    mainWindow = undefined;
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await window.loadURL(devServerUrl);
    return window;
  }

  await window.loadFile(join(currentDir, "../dist-renderer/index.html"));
  return window;
}

ipcMain.handle("orbit:getSnapshot", () => readDesktopSnapshot());
ipcMain.handle("orbit:getActivitySessionDetail", (_event, id: string) =>
  getActivitySessionDetailForDesktop(id)
);
ipcMain.handle("orbit:searchKnowledge", (_event, query: string, filters = {}) =>
  searchKnowledgeForDesktop(String(query ?? ""), filters)
);
ipcMain.handle("orbit:getKnowledgeArtifactDetail", (_event, id: string) =>
  getKnowledgeArtifactDetailForDesktop(id)
);
ipcMain.handle("orbit:editKnowledge", (_event, id: string, patch) =>
  editKnowledgeForDesktop(id, patch)
);
ipcMain.handle("orbit:reviewKnowledge", (_event, id: string, action: string) =>
  reviewKnowledgeForDesktop(id, requireKnowledgeAction(action))
);
ipcMain.handle("orbit:searchMemory", (_event, query: string, filters = {}) =>
  searchMemoryForDesktop(String(query ?? ""), filters)
);
ipcMain.handle("orbit:getMemoryDetail", (_event, id: string) => getMemoryDetailForDesktop(id));
ipcMain.handle("orbit:editMemory", (_event, id: string, patch) => editMemoryForDesktop(id, patch));
ipcMain.handle("orbit:reviewMemory", (_event, id: string, action: string) =>
  reviewMemoryForDesktop(id, requireMemoryAction(action))
);
ipcMain.handle("orbit:getRecommendationDetail", (_event, id: string) =>
  getRecommendationDetailForDesktop(id)
);
ipcMain.handle(
  "orbit:reviewRecommendation",
  (_event, id: string, action: string, options?: { snoozeUntil?: string | undefined }) =>
    reviewRecommendationForDesktop(id, requireRecommendationAction(action), options)
);
ipcMain.handle("orbit:updateSetting", (_event, key: string, value: unknown) => {
  const snapshot = updateSettingForDesktop(requireSettingKey(key), value);
  applyRuntimeSettings();
  return snapshot;
});
ipcMain.handle("orbit:setCollectionPaused", async (_event, paused: boolean) => {
  let snapshot = setCollectionPausedForDesktop(Boolean(paused));
  applyRuntimeSettings();
  if (!paused) {
    await runBackgroundIngestionTick();
    snapshot = readDesktopSnapshot();
  }
  return snapshot;
});
ipcMain.handle("orbit:updateSourceRuntime", async (_event, sourceId: string, action: string) => {
  let snapshot = updateSourceRuntimeForDesktop(sourceId, requireSourceRuntimeAction(action));
  applyRuntimeSettings();
  if (action === "resume" || action === "enable") {
    await runBackgroundIngestionTick();
    snapshot = readDesktopSnapshot();
  }
  return snapshot;
});
ipcMain.handle("orbit:setupSource", (_event, kind: string, path?: string) =>
  setupSourceForDesktop(requireSourceSetupKind(kind), path)
);
ipcMain.handle("orbit:reconfigureSource", (_event, sourceId: string, kind: string, path?: string) =>
  reconfigureSourceForDesktop(sourceId, requireSourceSetupKind(kind), path)
);
ipcMain.handle("orbit:deleteSource", (_event, sourceId: string) =>
  deleteSourceForDesktop(sourceId)
);
ipcMain.handle("orbit:resetSourceCursor", (_event, sourceId: string) =>
  resetSourceCursorForDesktop(sourceId)
);
ipcMain.handle("orbit:cleanupLegacyEventPrivacy", () => cleanupLegacyEventPrivacyForDesktop());
ipcMain.handle("orbit:generateHandoff", (_event, input) => generateHandoffForDesktop(input));
ipcMain.handle("orbit:reindexLocalData", () => reindexForDesktop());
ipcMain.handle("orbit:clearLocalData", () => clearLocalDataForDesktop());
ipcMain.handle("orbit:exportContext", () => exportContextForDesktop());
ipcMain.handle("orbit:testAIProvider", (_event, config) => testAIProviderForDesktop(config));

app.whenReady().then(async () => {
  applyRuntimeSettings();
  const window = await createMainWindow();
  if (process.env.ORBIT_E2E_RENDERER_SMOKE === "1") {
    void runRendererSmoke(window);
  } else {
    startBackgroundIngestion();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function applyRuntimeSettings(): void {
  const settings = readDesktopSettings();
  if (process.env.ORBIT_SKIP_LOGIN_ITEM_SETTINGS !== "1") {
    try {
      app.setLoginItemSettings({ openAtLogin: settings.launchAtLoginEnabled });
    } catch (error) {
      console.warn(
        `Orbit could not update login item settings: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
  if (settings.menuBarEnabled) {
    ensureTray();
  } else {
    tray?.destroy();
    tray = undefined;
  }
}

function ensureTray(): void {
  if (!tray) {
    const image = nativeImage.createEmpty();
    tray = new Tray(image);
    if (process.platform === "darwin") {
      tray.setTitle("Orbit");
    }
  }
  const runtime = readDesktopSnapshot().runtime;
  const paused = runtime.collectionPaused;
  const status = runtime.status;
  tray.setToolTip(`Orbit: ${status}`);
  if (process.platform === "darwin") {
    tray.setTitle(paused ? "Orbit Paused" : "Orbit");
  }
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show Orbit",
        click: () => {
          void createMainWindow();
        }
      },
      {
        label: paused ? "Resume Collection" : "Pause Collection",
        click: () => {
          void handleTrayPauseToggle(!paused);
        }
      },
      {
        label: `Status: ${status}`,
        enabled: false
      },
      {
        label: "Quit",
        click: () => app.quit()
      }
    ])
  );
}

async function handleTrayPauseToggle(paused: boolean): Promise<void> {
  setCollectionPausedForDesktop(paused);
  applyRuntimeSettings();
  if (!paused) {
    await runBackgroundIngestionTick();
  }
}

function startBackgroundIngestion(): void {
  if (backgroundIngestionTimer) return;
  void runBackgroundIngestionTick();
  backgroundIngestionTimer = setInterval(() => {
    void runBackgroundIngestionTick();
  }, backgroundIngestionIntervalMs);
}

async function runBackgroundIngestionTick(): Promise<void> {
  if (backgroundIngestionRunning) return;
  backgroundIngestionRunning = true;
  try {
    await runBackgroundIngestionForDesktop();
  } finally {
    backgroundIngestionRunning = false;
    applyRuntimeSettings();
    notifySnapshotChanged();
  }
}

function notifySnapshotChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("orbit:snapshotChanged");
  }
}

async function runRendererSmoke(window: BrowserWindow): Promise<void> {
  try {
    await setupSourceForDesktop("fixtures");
    notifySnapshotChanged();
    await window.webContents.executeJavaScript(
      `
        (async () => {
          const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const waitFor = async (selector) => {
            for (let index = 0; index < 120; index += 1) {
              const element = document.querySelector(selector);
              if (element) return element;
              await sleep(100);
            }
            throw new Error("Missing selector: " + selector);
          };
          const click = async (selector) => {
            const element = await waitFor(selector);
            element.click();
            await sleep(150);
          };
          const pageIds = [
            "today",
            "activity",
            "knowledge",
            "memory",
            "recommendations",
            "handoff",
            "review",
            "sources",
            "settings"
          ];
          for (const pageId of pageIds) {
            await click('[data-page-id="' + pageId + '"]');
            await waitFor('[data-page-id="' + pageId + '"].active');
          }
          await waitFor(".provider-boundary");
          await click('[data-settings-section-id="privacy"]');
          await waitFor(".privacy-settings-panel");
          await click('[data-settings-section-id="indexing"]');
          await waitFor(".index-settings-panel");
          await click('[data-page-id="knowledge"]');
          const artifact = await waitFor(".knowledge-list-item");
          artifact.click();
          await waitFor(".knowledge-detail-pane .detail-header");
          await waitFor(".markdown-preview");
          await click('[data-page-id="memory"]');
          const memory = await waitFor(".memory-list-item");
          memory.click();
          await waitFor(".memory-detail-pane .detail-header");
          await waitFor(".memory-detail-pane .detail-grid");
          await click('[data-page-id="recommendations"]');
          const recommendation = await waitFor(".recommendation-list-item");
          recommendation.click();
          await waitFor(".recommendation-detail-pane .detail-header");
          await waitFor(".snooze-control");
          await click('[data-page-id="activity"]');
          const session = await waitFor(".activity-list-item");
          session.click();
          await waitFor(".detail-header");
          await waitFor(".detail-grid");
          await waitFor(".event-stream .event-row");
          await waitFor(".derived-grid");
          return true;
        })()
      `,
      true
    );
    app.exit(0);
  } catch (error) {
    console.error(
      `Orbit renderer smoke failed: ${error instanceof Error ? error.message : String(error)}`
    );
    app.exit(1);
  }
}

function requireKnowledgeAction(action: string): "confirm" | "reject" | "archive" {
  if (action === "confirm" || action === "reject" || action === "archive") return action;
  throw new Error(`Unsupported knowledge action: ${action}`);
}

function requireMemoryAction(action: string): "confirm" | "reject" | "archive" {
  if (action === "confirm" || action === "reject" || action === "archive") return action;
  throw new Error(`Unsupported memory action: ${action}`);
}

function requireRecommendationAction(action: string): "accept" | "dismiss" | "snooze" | "resolve" {
  if (action === "accept" || action === "dismiss" || action === "snooze" || action === "resolve") {
    return action;
  }
  throw new Error(`Unsupported recommendation action: ${action}`);
}

function requireSettingKey(
  key: string
):
  | "desktop.menuBarEnabled"
  | "desktop.launchAtLoginEnabled"
  | "desktop.language"
  | "storage.configuredDatabasePath"
  | "ai.providerKind"
  | "ai.baseUrl"
  | "ai.model"
  | "ai.apiKey"
  | "ai.maxTokens"
  | "ai.testMaxTokens"
  | "ai.tokenLimitParameter"
  | "sources.setupCompleted" {
  if (
    key === "desktop.menuBarEnabled" ||
    key === "desktop.launchAtLoginEnabled" ||
    key === "desktop.language" ||
    key === "storage.configuredDatabasePath" ||
    key === "ai.providerKind" ||
    key === "ai.baseUrl" ||
    key === "ai.model" ||
    key === "ai.apiKey" ||
    key === "ai.maxTokens" ||
    key === "ai.testMaxTokens" ||
    key === "ai.tokenLimitParameter" ||
    key === "sources.setupCompleted"
  ) {
    return key;
  }
  throw new Error(`Unsupported setting key: ${key}`);
}

function requireSourceSetupKind(kind: string): "fixtures" | "codex" | "local_agent" | "seatalk" {
  if (kind === "fixtures" || kind === "codex" || kind === "local_agent" || kind === "seatalk") {
    return kind;
  }
  throw new Error(`Unsupported source setup kind: ${kind}`);
}

function requireSourceRuntimeAction(action: string): "pause" | "resume" | "enable" | "disable" {
  if (action === "pause" || action === "resume" || action === "enable" || action === "disable") {
    return action;
  }
  throw new Error(`Unsupported source runtime action: ${action}`);
}
