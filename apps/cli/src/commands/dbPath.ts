import { resolveOrbitDbPath } from "@orbit/db";
import { getCliConfig } from "../config";

export function getDbPath(): string {
  const config = getCliConfig();
  return resolveOrbitDbPath(config.orbitHome);
}
