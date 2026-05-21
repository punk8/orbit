import { openOrbitDatabase, readPerceptionStatus } from "@orbit/db";
import { getCliConfig } from "../config";
import type { PerceptionControlPlaneStatus } from "@orbit/core";

export interface PerceptionStatusResult {
  orbitHome: string;
  dbPath: string;
  perception: PerceptionControlPlaneStatus;
}

export function getPerceptionStatus(): PerceptionStatusResult {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      perception: readPerceptionStatus(database.db)
    };
  } finally {
    database.close();
  }
}
