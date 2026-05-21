import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import electronPath from "electron";

const packagedEntry = resolve("release/mac-arm64/Orbit.app/Contents/MacOS/Orbit");
const appEntry = resolve("dist-electron/main.cjs");
if (!existsSync(appEntry) && !existsSync(packagedEntry)) {
  throw new Error("Desktop build is missing. Run pnpm --filter @orbit/desktop build first.");
}

const orbitHome = mkdtempSync(join(tmpdir(), "orbit-desktop-e2e-"));
const env = {
  ...process.env,
  ORBIT_HOME: orbitHome,
  ORBIT_E2E_RENDERER_SMOKE: "1",
  ORBIT_SKIP_LOGIN_ITEM_SETTINGS: "1"
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;

const usePackagedApp = !existsSync(appEntry) && existsSync(packagedEntry);
if (!usePackagedApp) {
  run("pnpm", ["exec", "electron-builder", "install-app-deps"]);
}

const child = spawn(
  usePackagedApp ? packagedEntry : electronPath,
  usePackagedApp ? [] : [appEntry],
  {
    env,
    stdio: ["ignore", "pipe", "pipe"]
  }
);

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

let completed = false;

const timeout = setTimeout(() => {
  completed = true;
  child.kill("SIGTERM");
  setTimeout(() => {
    child.kill("SIGKILL");
    cleanup();
    console.error("Electron renderer smoke timed out.");
    console.error(output);
    process.exit(1);
  }, 500).unref();
}, 15000);

child.on("exit", (code, signal) => {
  if (completed) return;
  completed = true;
  clearTimeout(timeout);
  cleanup();
  if (signal === "SIGTERM" || signal === "SIGKILL") {
    process.exit(0);
  }
  if (code === 0) {
    process.exit(0);
  }
  console.error(output);
  process.exit(code ?? 1);
});

function cleanup() {
  rmSync(orbitHome, { recursive: true, force: true });
  if (!usePackagedApp) {
    run("pnpm", ["rebuild", "better-sqlite3"]);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
