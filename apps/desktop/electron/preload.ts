import { contextBridge, ipcRenderer } from "electron";
import type { OrbitDesktopApi } from "../src/orbitApi";

const orbitApi: OrbitDesktopApi = {
  getSnapshot: () => ipcRenderer.invoke("orbit:getSnapshot"),
  reviewKnowledge: (id, action) => ipcRenderer.invoke("orbit:reviewKnowledge", id, action),
  reviewMemory: (id, action) => ipcRenderer.invoke("orbit:reviewMemory", id, action),
  reviewRecommendation: (id, action, options) =>
    ipcRenderer.invoke("orbit:reviewRecommendation", id, action, options),
  updateSetting: (key, value) => ipcRenderer.invoke("orbit:updateSetting", key, value),
  setCollectionPaused: (paused) => ipcRenderer.invoke("orbit:setCollectionPaused", paused),
  updateSourceRuntime: (sourceId, action) =>
    ipcRenderer.invoke("orbit:updateSourceRuntime", sourceId, action),
  setupSource: (kind, path) => ipcRenderer.invoke("orbit:setupSource", kind, path),
  reindexLocalData: () => ipcRenderer.invoke("orbit:reindexLocalData"),
  clearLocalData: () => ipcRenderer.invoke("orbit:clearLocalData"),
  exportContext: () => ipcRenderer.invoke("orbit:exportContext"),
  testAIProvider: (config) => ipcRenderer.invoke("orbit:testAIProvider", config),
  onSnapshotChanged: (callback) => {
    const listener = (): void => callback();
    ipcRenderer.on("orbit:snapshotChanged", listener);
    return () => ipcRenderer.removeListener("orbit:snapshotChanged", listener);
  }
};

contextBridge.exposeInMainWorld("orbit", orbitApi);
