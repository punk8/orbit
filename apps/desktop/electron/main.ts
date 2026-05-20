import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { readDesktopSnapshot } from "./data";

const currentDir = __dirname;

async function createMainWindow(): Promise<void> {
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

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await window.loadURL(devServerUrl);
    return;
  }

  await window.loadFile(join(currentDir, "../dist-renderer/index.html"));
}

ipcMain.handle("orbit:getSnapshot", () => readDesktopSnapshot());

app.whenReady().then(async () => {
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
