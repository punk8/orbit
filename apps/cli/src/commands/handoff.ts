import { formatHandoffMarkdown, type HandoffPack } from "@orbit/core";
import {
  buildProjectHandoffPack,
  buildTodayHandoffPack,
  openOrbitDatabase
} from "@orbit/db";
import { getCliConfig } from "../config";

export function getTodayHandoff(
  options: { date?: string; generatedAt?: string } = {}
): HandoffPack {
  return withDatabase((database) => buildTodayHandoffPack(database, options));
}

export function getTodayHandoffMarkdown(options: { date?: string } = {}): string {
  return formatHandoffMarkdown(getTodayHandoff(options));
}

export function getProjectHandoff(project: string): HandoffPack {
  return withDatabase((database) => buildProjectHandoffPack(database, project));
}

export function getProjectHandoffMarkdown(project: string): string {
  return formatHandoffMarkdown(getProjectHandoff(project));
}

function withDatabase<T>(read: (database: ReturnType<typeof openOrbitDatabase>) => T): T {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    return read(database);
  } finally {
    database.close();
  }
}
