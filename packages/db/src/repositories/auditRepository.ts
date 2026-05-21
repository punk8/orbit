import type Database from "better-sqlite3";
import { createId } from "@orbit/core";
import { decodeJson, encodeJson } from "../json";

export interface AuditLog {
  id: string;
  operation: string;
  objectType: string;
  objectId?: string;
  details: unknown;
  createdAt: string;
}

interface AuditRow {
  id: string;
  operation: string;
  object_type: string;
  object_id: string | null;
  details_json: string;
  created_at: string;
}

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

  listAuditLogs(): AuditLog[] {
    return this.db
      .prepare("SELECT * FROM audit_logs ORDER BY created_at, rowid")
      .all()
      .map((row) => mapAuditLog(row as AuditRow));
  }
}

function mapAuditLog(row: AuditRow): AuditLog {
  const log: AuditLog = {
    id: row.id,
    operation: row.operation,
    objectType: row.object_type,
    details: decodeJson<unknown>(row.details_json),
    createdAt: row.created_at
  };
  if (row.object_id) log.objectId = row.object_id;
  return log;
}
