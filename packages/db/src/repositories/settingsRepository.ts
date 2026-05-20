import type Database from "better-sqlite3";
import { decodeJson, encodeJson } from "../json";

interface SettingRow {
  key: string;
  value_json: string;
  updated_at: string;
}

export class SettingsRepository {
  constructor(private readonly db: Database.Database) {}

  get<T>(key: string): T | undefined {
    const row = this.db.prepare("SELECT * FROM settings WHERE key = ?").get(key) as
      | SettingRow
      | undefined;
    return row ? decodeJson<T>(row.value_json) : undefined;
  }

  set<T>(key: string, value: T): void {
    this.db
      .prepare(
        `
        INSERT INTO settings (key, value_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = excluded.updated_at
      `
      )
      .run(key, encodeJson(value), new Date().toISOString());
  }

  list(): Record<string, unknown> {
    const entries = this.db
      .prepare("SELECT * FROM settings ORDER BY key")
      .all()
      .map((row) => row as SettingRow)
      .map((row) => [row.key, decodeJson<unknown>(row.value_json)] as const);
    return Object.fromEntries(entries);
  }
}
