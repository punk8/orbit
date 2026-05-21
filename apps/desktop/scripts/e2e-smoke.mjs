import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import electronPath from "electron";

class ProcessFailure extends Error {
  constructor(status) {
    super(`Command failed with status ${status}.`);
    this.status = status;
  }
}

const packagedEntry = resolve("release/mac-arm64/Orbit.app/Contents/MacOS/Orbit");
const appEntry = resolve("dist-electron/main.cjs");
if (!existsSync(appEntry) && !existsSync(packagedEntry)) {
  throw new Error("Desktop build is missing. Run pnpm --filter @orbit/desktop build first.");
}

const orbitHome = mkdtempSync(join(tmpdir(), "orbit-desktop-e2e-"));
const env = {
  ...process.env,
  ORBIT_FIXTURES_ROOT: resolve("../..", "fixtures"),
  ORBIT_HOME: orbitHome,
  ORBIT_E2E_RENDERER_SMOKE: "1",
  ORBIT_SKIP_LOGIN_ITEM_SETTINGS: "1"
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;

const usePackagedApp = !existsSync(appEntry) && existsSync(packagedEntry);
try {
  if (!usePackagedApp) {
    run("pnpm", ["exec", "electron-builder", "install-app-deps"]);
    run("node", ["scripts/rebuild-native.mjs", "electron"]);
  }
  process.exitCode = await runSmoke();
} catch (error) {
  if (error instanceof ProcessFailure) {
    process.exitCode = error.status;
  } else {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
} finally {
  cleanup();
}

function runSmoke() {
  return new Promise((resolveExitCode) => {
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
    let timedOut = false;
    let forceKillTimer;
    const finish = (exitCode) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      resolveExitCode(exitCode);
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (!completed) {
          child.kill("SIGKILL");
        }
        console.error("Electron renderer smoke timed out.");
        console.error(output);
        finish(1);
      }, 500);
    }, 15000);

    child.on("exit", (code, signal) => {
      if (timedOut) {
        console.error("Electron renderer smoke timed out.");
        console.error(output);
        finish(1);
        return;
      }
      if (signal === "SIGTERM" || signal === "SIGKILL") {
        finish(0);
        return;
      }
      if (code === 0) {
        finish(0);
        return;
      }
      console.error(output);
      finish(code ?? 1);
    });
    child.on("error", (error) => {
      console.error(error.message);
      finish(1);
    });
  });
}

function cleanup() {
  rmSync(orbitHome, { recursive: true, force: true });
  if (!usePackagedApp) {
    const result = spawnSync("node", ["scripts/rebuild-native.mjs", "node"], {
      env: process.env,
      stdio: "inherit"
    });
    if ((process.exitCode ?? 0) === 0 && result.status !== 0) {
      process.exitCode = result.status ?? 1;
    }
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new ProcessFailure(result.status ?? 1);
  }
}
