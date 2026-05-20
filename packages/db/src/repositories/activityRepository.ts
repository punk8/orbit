import type Database from "better-sqlite3";
import type { ActivitySession } from "@orbit/core";
import { decodeJson, encodeJson } from "../json";

interface ActivityRow {
  id: string;
  schema_version: number;
  title: string;
  start_at: string;
  end_at: string;
  duration_seconds: number;
  source_kinds_json: string;
  apps_json: string;
  event_count: number;
  topic: string | null;
  project: string | null;
  summary: string | null;
  evidence_json: string;
  media_json: string | null;
  local_state_json: string;
  privacy_json: string;
  created_at: string;
  updated_at: string;
}

export class ActivityRepository {
  constructor(private readonly db: Database.Database) {}

  upsertActivitySession(session: ActivitySession): void {
    this.db
      .prepare(
        `
        INSERT INTO activity_sessions (
          id, schema_version, title, start_at, end_at, duration_seconds,
          source_kinds_json, apps_json, event_count, topic, project, summary,
          evidence_json, media_json, local_state_json, privacy_json, created_at, updated_at
        )
        VALUES (
          @id, @schemaVersion, @title, @startAt, @endAt, @durationSeconds,
          @sourceKindsJson, @appsJson, @eventCount, @topic, @project, @summary,
          @evidenceJson, @mediaJson, @localStateJson, @privacyJson, @createdAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          end_at = excluded.end_at,
          event_count = excluded.event_count,
          summary = excluded.summary,
          evidence_json = excluded.evidence_json,
          updated_at = excluded.updated_at
      `
      )
      .run({
        id: session.id,
        schemaVersion: session.schemaVersion,
        title: session.title,
        startAt: session.startAt,
        endAt: session.endAt,
        durationSeconds: session.durationSeconds,
        sourceKindsJson: encodeJson(session.sourceKinds),
        appsJson: encodeJson(session.apps),
        eventCount: session.eventCount,
        topic: session.topic ?? null,
        project: session.project ?? null,
        summary: session.summary ?? null,
        evidenceJson: encodeJson(session.evidence),
        mediaJson: session.media ? encodeJson(session.media) : null,
        localStateJson: encodeJson(session.localState),
        privacyJson: encodeJson(session.privacy),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      });

    this.db
      .prepare("DELETE FROM activity_event_links WHERE activity_session_id = ?")
      .run(session.id);
    const insertLink = this.db.prepare(
      "INSERT INTO activity_event_links (activity_session_id, event_id, position) VALUES (?, ?, ?)"
    );
    session.eventIds.forEach((eventId, index) => insertLink.run(session.id, eventId, index));
  }

  listActivitySessions(): ActivitySession[] {
    return this.db
      .prepare("SELECT * FROM activity_sessions ORDER BY start_at, id")
      .all()
      .map((row) => this.mapActivity(row as ActivityRow));
  }

  getActivitySession(id: string): ActivitySession | undefined {
    const row = this.db.prepare("SELECT * FROM activity_sessions WHERE id = ?").get(id) as
      | ActivityRow
      | undefined;
    return row ? this.mapActivity(row) : undefined;
  }

  countActivitySessions(): number {
    return (
      this.db.prepare("SELECT count(*) as count FROM activity_sessions").get() as { count: number }
    ).count;
  }

  private mapActivity(row: ActivityRow): ActivitySession {
    const eventIds = this.db
      .prepare(
        "SELECT event_id FROM activity_event_links WHERE activity_session_id = ? ORDER BY position"
      )
      .all(row.id)
      .map((link) => (link as { event_id: string }).event_id);
    const session: ActivitySession = {
      id: row.id,
      schemaVersion: row.schema_version,
      title: row.title,
      startAt: row.start_at,
      endAt: row.end_at,
      durationSeconds: row.duration_seconds,
      sourceKinds: decodeJson<ActivitySession["sourceKinds"]>(row.source_kinds_json),
      apps: decodeJson<string[]>(row.apps_json),
      eventCount: row.event_count,
      eventIds,
      evidence: decodeJson<ActivitySession["evidence"]>(row.evidence_json),
      localState: decodeJson<ActivitySession["localState"]>(row.local_state_json),
      privacy: decodeJson<ActivitySession["privacy"]>(row.privacy_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
    if (row.topic) session.topic = row.topic;
    if (row.project) session.project = row.project;
    if (row.summary) session.summary = row.summary;
    if (row.media_json) {
      session.media = decodeJson<NonNullable<ActivitySession["media"]>>(row.media_json);
    }
    return session;
  }
}
