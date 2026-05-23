import { join } from "node:path";
import { dirname } from "node:path";
import { existsSync } from "node:fs";
import { resolveOrbitHome } from "@orbit/db";

export interface CliConfig {
  orbitHome: string;
  repoRoot: string;
}

export function getCliConfig(cwd = process.cwd()): CliConfig {
  return {
    orbitHome: resolveOrbitHome(),
    repoRoot: findRepoRoot(cwd)
  };
}

function findRepoRoot(startDir: string): string {
  let current = startDir;
  while (true) {
    const candidate = join(current, "pnpm-workspace.yaml");
    if (existsSync(candidate)) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}
