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
const env = { ...process.env, ORBIT_HOME: orbitHome };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;

const usePackagedApp = existsSync(packagedEntry);
if (!usePackagedApp) {
  run("pnpm", ["exec", "electron-builder", "install-app-deps", "--config", "electron-builder.yml"]);
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

const timeout = setTimeout(() => {
  child.kill("SIGTERM");
}, 3000);

child.on("exit", (code, signal) => {
  clearTimeout(timeout);
  rmSync(orbitHome, { recursive: true, force: true });
  if (!usePackagedApp) {
    run("pnpm", ["rebuild", "better-sqlite3"]);
  }
  if (signal === "SIGTERM") {
    process.exit(0);
  }
  if (code === 0) {
    process.exit(0);
  }
  console.error(output);
  process.exit(code ?? 1);
});

function run(command, args) {
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
