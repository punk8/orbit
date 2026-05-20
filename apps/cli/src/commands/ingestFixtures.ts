import { join } from "node:path";
import { FixtureAdapter } from "@orbit/adapters";
import { ingestEventsFromAdapter } from "@orbit/core";
import { AuditRepository, EventRepository, openOrbitDatabase, SourceRepository } from "@orbit/db";
import { getCliConfig } from "../config";
import { runSemanticPipeline, type SemanticPipelineResult } from "./semanticPipeline";

export interface IngestFixturesResult {
  orbitHome: string;
  dbPath: string;
  adapters: Array<{
    adapterId: string;
    read: number;
    inserted: number;
    skipped: number;
    nextCursor?: string;
    warnings: string[];
  }>;
  totals: {
    read: number;
    inserted: number;
    skipped: number;
  };
  pipeline: SemanticPipelineResult;
}

export async function ingestFixtures(): Promise<IngestFixturesResult> {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    const sourceRepository = new SourceRepository(database.db);
    const eventRepository = new EventRepository(database.db);
    const auditRepository = new AuditRepository(database.db);
    const adapters = [
      new FixtureAdapter({
        kind: "codex",
        directory: join(config.fixturesRoot, "codex"),
        id: "fixture_codex",
        displayName: "Fixture Codex"
      }),
      new FixtureAdapter({
        kind: "seatalk",
        directory: join(config.fixturesRoot, "seatalk"),
        id: "fixture_seatalk",
        displayName: "Fixture SeaTalk",
        defaultSensitivity: "confidential"
      })
    ];

    const results = [];
    for (const adapter of adapters) {
      sourceRepository.upsertFromAdapter(adapter);
      const cursor = sourceRepository.getCursor(adapter.id);
      const result = await ingestEventsFromAdapter(adapter, eventRepository, cursor);
      sourceRepository.setCursor(adapter.id, result.nextCursor);
      sourceRepository.recordSyncSuccess(adapter.id, { lastEventAt: result.lastEventAt });
      auditRepository.log("source.ingest", "source", adapter.id, {
        mode: "cli",
        kind: adapter.kind,
        read: result.read,
        inserted: result.inserted,
        skipped: result.skipped,
        warnings: result.warnings
      });
      results.push(result);
    }

    const pipeline = runSemanticPipeline(database);

    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      adapters: results,
      totals: {
        read: results.reduce((total, result) => total + result.read, 0),
        inserted: results.reduce((total, result) => total + result.inserted, 0),
        skipped: results.reduce((total, result) => total + result.skipped, 0)
      },
      pipeline
    };
  } finally {
    database.close();
  }
}
