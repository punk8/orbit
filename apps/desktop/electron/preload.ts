import { contextBridge, ipcRenderer } from "electron";
import type { OrbitDesktopApi } from "../src/orbitApi";

const orbitApi: OrbitDesktopApi = {
  getSnapshot: () => ipcRenderer.invoke("orbit:getSnapshot"),
  getActivitySessionDetail: (id) => ipcRenderer.invoke("orbit:getActivitySessionDetail", id),
  deleteActivitySession: (id) => ipcRenderer.invoke("orbit:deleteActivitySession", id),
  searchKnowledge: (query, filters) => ipcRenderer.invoke("orbit:searchKnowledge", query, filters),
  getKnowledgeArtifactDetail: (id) => ipcRenderer.invoke("orbit:getKnowledgeArtifactDetail", id),
  editKnowledge: (id, patch) => ipcRenderer.invoke("orbit:editKnowledge", id, patch),
  reviewKnowledge: (id, action) => ipcRenderer.invoke("orbit:reviewKnowledge", id, action),
  regenerateKnowledge: (id) => ipcRenderer.invoke("orbit:regenerateKnowledge", id),
  translateKnowledge: (id, language) => ipcRenderer.invoke("orbit:translateKnowledge", id, language),
  deleteKnowledge: (id) => ipcRenderer.invoke("orbit:deleteKnowledge", id),
  searchMemory: (query, filters) => ipcRenderer.invoke("orbit:searchMemory", query, filters),
  getMemoryDetail: (id) => ipcRenderer.invoke("orbit:getMemoryDetail", id),
  editMemory: (id, patch) => ipcRenderer.invoke("orbit:editMemory", id, patch),
  reviewMemory: (id, action) => ipcRenderer.invoke("orbit:reviewMemory", id, action),
  deleteMemory: (id) => ipcRenderer.invoke("orbit:deleteMemory", id),
  rollbackMemoryVersion: (id) => ipcRenderer.invoke("orbit:rollbackMemoryVersion", id),
  getRecommendationDetail: (id) => ipcRenderer.invoke("orbit:getRecommendationDetail", id),
  reviewRecommendation: (id, action, options) =>
    ipcRenderer.invoke("orbit:reviewRecommendation", id, action, options),
  updateSetting: (key, value) => ipcRenderer.invoke("orbit:updateSetting", key, value),
  setCollectionPaused: (paused) => ipcRenderer.invoke("orbit:setCollectionPaused", paused),
  updateSourceRuntime: (sourceId, action) =>
    ipcRenderer.invoke("orbit:updateSourceRuntime", sourceId, action),
  updatePerceptionSourceRuntime: (sourceKind, action) =>
    ipcRenderer.invoke("orbit:updatePerceptionSourceRuntime", sourceKind, action),
  updatePerceptionSourcePolicy: (sourceKind, patch) =>
    ipcRenderer.invoke("orbit:updatePerceptionSourcePolicy", sourceKind, patch),
  updatePerceptionProviderRoute: (task, provider) =>
    ipcRenderer.invoke("orbit:updatePerceptionProviderRoute", task, provider),
  updatePerceptionSamplingPreset: (preset) =>
    ipcRenderer.invoke("orbit:updatePerceptionSamplingPreset", preset),
  upsertProtectedRule: (input) => ipcRenderer.invoke("orbit:upsertProtectedRule", input),
  ignoreCurrentContext: (input) => ipcRenderer.invoke("orbit:ignoreCurrentContext", input),
  previewSourceImport: (kind, path) => ipcRenderer.invoke("orbit:previewSourceImport", kind, path),
  confirmSourceImport: (kind, path) => ipcRenderer.invoke("orbit:confirmSourceImport", kind, path),
  setupSource: (kind, path) => ipcRenderer.invoke("orbit:setupSource", kind, path),
  reconfigureSource: (sourceId, kind, path) =>
    ipcRenderer.invoke("orbit:reconfigureSource", sourceId, kind, path),
  deleteSource: (sourceId) => ipcRenderer.invoke("orbit:deleteSource", sourceId),
  resetSourceCursor: (sourceId) => ipcRenderer.invoke("orbit:resetSourceCursor", sourceId),
  cleanupLegacyEventPrivacy: () => ipcRenderer.invoke("orbit:cleanupLegacyEventPrivacy"),
  cleanupPerceptionSidecars: (options) =>
    ipcRenderer.invoke("orbit:cleanupPerceptionSidecars", options),
  disablePerceptionSourceAndDeleteRaw: (sourceKind) =>
    ipcRenderer.invoke("orbit:disablePerceptionSourceAndDeleteRaw", sourceKind),
  deletePerceptionEvents: (options) => ipcRenderer.invoke("orbit:deletePerceptionEvents", options),
  captureScreenOcr: () => ipcRenderer.invoke("orbit:captureScreenOcr"),
  captureScreenOcrBurst: () => ipcRenderer.invoke("orbit:captureScreenOcrBurst"),
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
  },
  onNavigate: (callback) => {
    const listener = (_event: unknown, page: string): void => {
      callback(page as Parameters<typeof callback>[0]);
    };
    ipcRenderer.on("orbit:navigate", listener);
    return () => ipcRenderer.removeListener("orbit:navigate", listener);
  }
};

contextBridge.exposeInMainWorld("orbit", orbitApi);
