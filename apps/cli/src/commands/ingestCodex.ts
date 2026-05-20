import { CodexAdapter } from "@orbit/adapters";
import { ingestEventsFromAdapter } from "@orbit/core";
import { EventRepository, openOrbitDatabase, SourceRepository } from "@orbit/db";
import { isAbsolute, resolve } from "node:path";
import { getCliConfig } from "../config";
import { runSemanticPipeline, type SemanticPipelineResult } from "./semanticPipeline";

export interface IngestCodexResult {
  orbitHome: string;
  dbPath: string;
  adapterId: string;
  path: string;
  read: number;
  inserted: number;
  skipped: number;
  nextCursor?: string;
  warnings: string[];
  pipeline: SemanticPipelineResult;
}

export async function ingestCodex(path: string): Promise<IngestCodexResult> {
  const config = getCliConfig();
  const inputPath = isAbsolute(path) ? path : resolve(process.env.INIT_CWD ?? process.cwd(), path);
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    const sourceRepository = new SourceRepository(database.db);
    const eventRepository = new EventRepository(database.db);
    const adapter = new CodexAdapter({ path: inputPath });
    sourceRepository.upsertFromAdapter(adapter);

    const cursor = sourceRepository.getCursor(adapter.id);
    const result = await ingestEventsFromAdapter(adapter, eventRepository, cursor);
    sourceRepository.setCursor(adapter.id, result.nextCursor);
    const pipeline = runSemanticPipeline(database);

    const response: IngestCodexResult = {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      adapterId: adapter.id,
      path: inputPath,
      read: result.read,
      inserted: result.inserted,
      skipped: result.skipped,
      warnings: result.warnings,
      pipeline
    };
    if (result.nextCursor) {
      response.nextCursor = result.nextCursor;
    }
    return response;
  } finally {
    database.close();
  }
}
