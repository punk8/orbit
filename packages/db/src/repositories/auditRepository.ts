import type Database from "better-sqlite3";
import { createId } from "@orbit/core";
import { encodeJson } from "../json";

export class AuditRepository {
  constructor(private readonly db: Database.Database) {}

  log(operation: string, objectType: string, objectId: string | undefined, details: unknown): void {
    this.db
      .prepare(
        `
        INSERT INTO audit_logs (id, operation, object_type, object_id, details_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        createId("audit"),
        operation,
        objectType,
        objectId ?? null,
        encodeJson(details),
        new Date().toISOString()
      );
  }
}
