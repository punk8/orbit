import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const runtimeConfigFile = "runtime-config.json";

interface OrbitRuntimeConfig {
  configuredDatabasePath?: string;
}

export function resolveOrbitHome(input?: string): string {
  return (
    input ?? process.env.ORBIT_HOME ?? join(homedir(), "Library", "Application Support", "Orbit")
  );
}

export function resolveOrbitDbPath(orbitHome: string): string {
  const envPath = process.env.ORBIT_DB_PATH;
  if (envPath) {
    return envPath;
  }
  const config = readOrbitRuntimeConfig(orbitHome);
  if (config.configuredDatabasePath) {
    return config.configuredDatabasePath;
  }
  return join(orbitHome, "orbit.db");
}

export function writeOrbitRuntimeConfig(orbitHome: string, config: OrbitRuntimeConfig): void {
  writeFileSync(join(orbitHome, runtimeConfigFile), JSON.stringify(config, null, 2));
}

function readOrbitRuntimeConfig(orbitHome: string): OrbitRuntimeConfig {
  const path = join(orbitHome, runtimeConfigFile);
  if (!existsSync(path)) {
    return {};
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as OrbitRuntimeConfig)
      : {};
  } catch {
    return {};
  }
}
