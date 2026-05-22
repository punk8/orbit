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

export function getTodayHandoffMarkdown(
  options: { date?: string; language?: "en" | "zh-CN" } = {}
): string {
  return formatHandoffMarkdown(getTodayHandoff(options), formatOptions(options.language));
}

export function getProjectHandoff(project: string): HandoffPack {
  return withDatabase((database) => buildProjectHandoffPack(database, project));
}

export function getProjectHandoffMarkdown(
  project: string,
  options: { language?: "en" | "zh-CN" } = {}
): string {
  return formatHandoffMarkdown(getProjectHandoff(project), formatOptions(options.language));
}

function formatOptions(language: "en" | "zh-CN" | undefined) {
  return language ? { language } : {};
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
