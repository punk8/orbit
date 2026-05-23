#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const orbitHome = resolve(repoRoot, ".tmp/source-install-release-gate");
mkdirSync(orbitHome, { recursive: true });

const steps = [
  ["pnpm", ["test"]],
  ["pnpm", ["typecheck"]],
  ["pnpm", ["lint"]],
  ["pnpm", ["--filter", "@orbit/desktop", "build"]],
  ["pnpm", ["--filter", "@orbit/desktop", "package:dir"]],
  ["pnpm", ["--filter", "@orbit/desktop", "package:smoke"]],
  [
    "pnpm",
    ["--filter", "@orbit/cli", "orbit", "perception", "release-gate", "--json"],
    { ORBIT_HOME: orbitHome }
  ]
];

for (const [command, args, extraEnv] of steps) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
