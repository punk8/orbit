import { spawnSync } from "node:child_process";
import { mkdirSync, openSync, closeSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const target = process.argv[2];
if (target !== "electron" && target !== "node") {
  console.error("Usage: node scripts/rebuild-native.mjs <electron|node>");
  process.exit(1);
}

const lockPath = resolve("node_modules/.cache/orbit-native-rebuild.lock");
const lockTimeoutMs = Number(process.env.ORBIT_NATIVE_REBUILD_LOCK_TIMEOUT_MS ?? 120_000);
mkdirSync(dirname(lockPath), { recursive: true });
const lockFd = acquireLock();

try {
  const env = { ...process.env };
  if (target === "electron") {
    env.npm_config_runtime = "electron";
    env.npm_config_target = readElectronVersion();
    env.npm_config_disturl = "https://electronjs.org/headers";
  } else {
    delete env.npm_config_runtime;
    delete env.npm_config_target;
    delete env.npm_config_disturl;
  }

  const result = spawnSync("pnpm", ["rebuild", "better-sqlite3"], {
    env,
    stdio: "inherit"
  });
  process.exitCode = result.status ?? 1;
} finally {
  closeSync(lockFd);
  rmSync(lockPath, { force: true });
}

function acquireLock() {
  const startedAt = Date.now();
  while (true) {
    try {
      return openSync(lockPath, "wx");
    } catch (error) {
      if (!isLockExistsError(error)) {
        throw error;
      }
      if (Date.now() - startedAt > lockTimeoutMs) {
        throw new Error(
          `Timed out waiting for native rebuild lock after ${lockTimeoutMs}ms: ${lockPath}`
        );
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
}

function isLockExistsError(error) {
  return (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

function readElectronVersion() {
  const result = spawnSync("node", ["-p", "require('electron/package.json').version"], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || "Unable to read Electron version.");
  }
  return result.stdout.trim();
}
