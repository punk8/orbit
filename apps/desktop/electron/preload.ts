import { contextBridge, ipcRenderer } from "electron";
import type { OrbitDesktopApi } from "../src/orbitApi";

const orbitApi: OrbitDesktopApi = {
  getSnapshot: () => ipcRenderer.invoke("orbit:getSnapshot"),
  getActivitySessionDetail: (id) => ipcRenderer.invoke("orbit:getActivitySessionDetail", id),
  searchKnowledge: (query, filters) => ipcRenderer.invoke("orbit:searchKnowledge", query, filters),
  getKnowledgeArtifactDetail: (id) => ipcRenderer.invoke("orbit:getKnowledgeArtifactDetail", id),
  editKnowledge: (id, patch) => ipcRenderer.invoke("orbit:editKnowledge", id, patch),
  reviewKnowledge: (id, action) => ipcRenderer.invoke("orbit:reviewKnowledge", id, action),
  searchMemory: (query, filters) => ipcRenderer.invoke("orbit:searchMemory", query, filters),
  getMemoryDetail: (id) => ipcRenderer.invoke("orbit:getMemoryDetail", id),
  editMemory: (id, patch) => ipcRenderer.invoke("orbit:editMemory", id, patch),
  reviewMemory: (id, action) => ipcRenderer.invoke("orbit:reviewMemory", id, action),
  getRecommendationDetail: (id) => ipcRenderer.invoke("orbit:getRecommendationDetail", id),
  reviewRecommendation: (id, action, options) =>
    ipcRenderer.invoke("orbit:reviewRecommendation", id, action, options),
  updateSetting: (key, value) => ipcRenderer.invoke("orbit:updateSetting", key, value),
  setCollectionPaused: (paused) => ipcRenderer.invoke("orbit:setCollectionPaused", paused),
  updateSourceRuntime: (sourceId, action) =>
    ipcRenderer.invoke("orbit:updateSourceRuntime", sourceId, action),
  setupSource: (kind, path) => ipcRenderer.invoke("orbit:setupSource", kind, path),
  reconfigureSource: (sourceId, kind, path) =>
    ipcRenderer.invoke("orbit:reconfigureSource", sourceId, kind, path),
  deleteSource: (sourceId) => ipcRenderer.invoke("orbit:deleteSource", sourceId),
  resetSourceCursor: (sourceId) => ipcRenderer.invoke("orbit:resetSourceCursor", sourceId),
  cleanupLegacyEventPrivacy: () => ipcRenderer.invoke("orbit:cleanupLegacyEventPrivacy"),
  generateHandoff: (input) => ipcRenderer.invoke("orbit:generateHandoff", input),
  reindexLocalData: () => ipcRenderer.invoke("orbit:reindexLocalData"),
  clearLocalData: () => ipcRenderer.invoke("orbit:clearLocalData"),
  exportContext: () => ipcRenderer.invoke("orbit:exportContext"),
  testAIProvider: (config) => ipcRenderer.invoke("orbit:testAIProvider", config),
  startObservation: () => ipcRenderer.invoke("orbit:startObservation"),
  pauseObservation: () => ipcRenderer.invoke("orbit:pauseObservation"),
  resumeObservation: () => ipcRenderer.invoke("orbit:resumeObservation"),
  stopObservation: () => ipcRenderer.invoke("orbit:stopObservation"),
  onSnapshotChanged: (callback) => {
    const listener = (): void => callback();
    ipcRenderer.on("orbit:snapshotChanged", listener);
    return () => ipcRenderer.removeListener("orbit:snapshotChanged", listener);
  }
};

contextBridge.exposeInMainWorld("orbit", orbitApi);
