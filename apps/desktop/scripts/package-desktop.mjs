import { spawnSync } from "node:child_process";

const target = process.argv[2];
if (target !== "dir" && target !== "dmg") {
  console.error("Usage: node scripts/package-desktop.mjs <dir|dmg>");
  process.exit(1);
}

class ProcessFailure extends Error {
  constructor(status) {
    super(`Command failed with status ${status}.`);
    this.status = status;
  }
}

let status = 1;
try {
  run("node", ["scripts/rebuild-native.mjs", "electron"]);
  run("pnpm", ["build"]);
  const builderArgs =
    target === "dir"
      ? ["exec", "electron-builder", "--dir", "--config", "electron-builder.yml"]
      : ["exec", "electron-builder", "--mac", "dmg", "--config", "electron-builder.yml"];
  run("pnpm", builderArgs);
  status = 0;
} catch (error) {
  if (error instanceof ProcessFailure) {
    status = error.status;
  } else {
    console.error(error instanceof Error ? error.message : String(error));
    status = 1;
  }
} finally {
  const restore = spawnSync("node", ["scripts/rebuild-native.mjs", "node"], {
    env: process.env,
    stdio: "inherit"
  });
  if (status === 0 && restore.status !== 0) {
    status = restore.status ?? 1;
  }
}

process.exit(status);

function run(command, args) {
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new ProcessFailure(result.status ?? 1);
  }
}
