import type { Actor, EventType, Sensitivity, SourceKind } from "@orbit/core";

export interface FixtureRecord {
  sourceKind: SourceKind;
  externalId: string;
  occurredAt: string;
  type: EventType;
  title?: string;
  text?: string;
  summary?: string;
  actor?: Actor;
  context?: {
    app?: string;
    windowTitle?: string;
    url?: string;
    project?: string;
    repository?: string;
    threadId?: string;
    conversationId?: string;
  };
  classification?: {
    topics: string[];
    entities: string[];
    intent?: string;
    confidence?: number;
  };
  sensitivity?: Sensitivity;
}

export interface FixtureReadItem {
  record: FixtureRecord;
  pointer: string;
}
