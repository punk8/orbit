import { contextBridge, ipcRenderer } from "electron";
import type { OrbitDesktopApi } from "../src/orbitApi";

const orbitApi: OrbitDesktopApi = {
  getSnapshot: () => ipcRenderer.invoke("orbit:getSnapshot")
};

contextBridge.exposeInMainWorld("orbit", orbitApi);
