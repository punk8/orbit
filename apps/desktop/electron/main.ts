import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage } from "electron";
import { join } from "node:path";
import {
  clearLocalDataForDesktop,
  exportContextForDesktop,
  readDesktopSnapshot,
  readDesktopSettings,
  reindexForDesktop,
  reviewKnowledgeForDesktop,
  reviewMemoryForDesktop,
  reviewRecommendationForDesktop,
  setupSourceForDesktop,
  updateSettingForDesktop
} from "./data";

const currentDir = __dirname;
let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;

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
ipcMain.handle("orbit:reviewKnowledge", (_event, id: string, action: string) =>
  reviewKnowledgeForDesktop(id, requireKnowledgeAction(action))
);
ipcMain.handle("orbit:reviewMemory", (_event, id: string, action: string) =>
  reviewMemoryForDesktop(id, requireMemoryAction(action))
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
ipcMain.handle("orbit:setupSource", (_event, kind: string, path?: string) =>
  setupSourceForDesktop(requireSourceSetupKind(kind), path)
);
ipcMain.handle("orbit:reindexLocalData", () => reindexForDesktop());
ipcMain.handle("orbit:clearLocalData", () => clearLocalDataForDesktop());
ipcMain.handle("orbit:exportContext", () => exportContextForDesktop());

app.whenReady().then(async () => {
  applyRuntimeSettings();
  await createMainWindow();

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
  app.setLoginItemSettings({ openAtLogin: settings.launchAtLoginEnabled });
  if (settings.menuBarEnabled) {
    ensureTray();
  } else {
    tray?.destroy();
    tray = undefined;
  }
}

function ensureTray(): void {
  if (tray) return;
  const image = nativeImage.createEmpty();
  tray = new Tray(image);
  if (process.platform === "darwin") {
    tray.setTitle("Orbit");
  }
  tray.setToolTip("Orbit");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show Orbit",
        click: () => {
          void createMainWindow();
        }
      },
      {
        label: "Quit",
        click: () => app.quit()
      }
    ])
  );
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
