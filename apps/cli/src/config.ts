import { join } from "node:path";
import { dirname } from "node:path";
import { existsSync } from "node:fs";
import { resolveOrbitHome } from "@orbit/db";

export interface CliConfig {
  orbitHome: string;
  fixturesRoot: string;
}

export function getCliConfig(cwd = process.cwd()): CliConfig {
  return {
    orbitHome: resolveOrbitHome(),
    fixturesRoot: findFixturesRoot(cwd)
  };
}

function findFixturesRoot(startDir: string): string {
  let current = startDir;
  while (true) {
    const candidate = join(current, "fixtures");
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      return join(startDir, "fixtures");
    }
    current = parent;
  }
}
