export const coreTables = [
  "sources",
  "source_cursors",
  "events",
  "activity_sessions",
  "activity_event_links",
  "knowledge_artifacts",
  "knowledge_sources",
  "memories",
  "memory_sources",
  "recommendations",
  "recommendation_sources",
  "audit_logs",
  "settings",
  "fts_knowledge",
  "fts_memory"
] as const;

export type CoreTable = (typeof coreTables)[number];
