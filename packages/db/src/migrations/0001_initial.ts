import type Database from "better-sqlite3";

export const migration0001 = {
  id: "0001_initial",
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        display_name TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        default_sensitivity TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS source_cursors (
        source_id TEXT PRIMARY KEY,
        cursor TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        source_kind TEXT NOT NULL,
        adapter_id TEXT NOT NULL,
        external_id TEXT,
        pointer TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        actor_json TEXT,
        context_json TEXT NOT NULL,
        type TEXT NOT NULL,
        content_json TEXT NOT NULL,
        classification_json TEXT,
        privacy_json TEXT NOT NULL,
        hash TEXT NOT NULL UNIQUE,
        raw_payload_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events(occurred_at);
      CREATE INDEX IF NOT EXISTS idx_events_source ON events(source_kind, adapter_id);
      CREATE INDEX IF NOT EXISTS idx_events_context_project ON events(json_extract(context_json, '$.project'));

      CREATE TABLE IF NOT EXISTS activity_sessions (
        id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        title TEXT NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL,
        source_kinds_json TEXT NOT NULL,
        apps_json TEXT NOT NULL,
        event_count INTEGER NOT NULL,
        topic TEXT,
        project TEXT,
        summary TEXT,
        evidence_json TEXT NOT NULL,
        media_json TEXT,
        local_state_json TEXT NOT NULL,
        privacy_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activity_event_links (
        activity_session_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (activity_session_id, event_id),
        FOREIGN KEY (activity_session_id) REFERENCES activity_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS knowledge_artifacts (
        id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        content_json TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        memory_candidate_ids_json TEXT,
        confidence REAL NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS knowledge_sources (
        artifact_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        PRIMARY KEY (artifact_id, source_type, source_id),
        FOREIGN KEY (artifact_id) REFERENCES knowledge_artifacts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL,
        scope_json TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        confidence REAL NOT NULL,
        valid_from TEXT,
        valid_until TEXT,
        last_reviewed_at TEXT,
        supersedes_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memory_sources (
        memory_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        PRIMARY KEY (memory_id, source_type, source_id),
        FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS recommendations (
        id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        explanation TEXT NOT NULL,
        suggested_action TEXT NOT NULL,
        confidence REAL NOT NULL,
        impact TEXT NOT NULL,
        status TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        due_at TEXT
      );

      CREATE TABLE IF NOT EXISTS recommendation_sources (
        recommendation_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        PRIMARY KEY (recommendation_id, source_type, source_id),
        FOREIGN KEY (recommendation_id) REFERENCES recommendations(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        object_type TEXT NOT NULL,
        object_id TEXT,
        details_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS fts_knowledge USING fts5(
        id UNINDEXED,
        title,
        markdown
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS fts_memory USING fts5(
        id UNINDEXED,
        title,
        body
      );
    `);
  }
};
