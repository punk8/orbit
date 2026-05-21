import type { Actor, AttachmentRef, ID, Sensitivity, SourceKind } from "./common";

export type EventType =
  | "message"
  | "command"
  | "code_change"
  | "test_result"
  | "meeting"
  | "screen_observation"
  | "app_focus"
  | "window_focus"
  | "window_title_change"
  | "accessibility_snapshot"
  | "browser_navigation"
  | "terminal_command"
  | "terminal_output_summary"
  | "clipboard_change"
  | "file_activity"
  | "ocr_text"
  | "audio_segment"
  | "transcript_segment"
  | "observation_state"
  | "permission_state"
  | "file_change"
  | "decision"
  | "todo"
  | "system";

export interface Event {
  id: ID;
  schemaVersion: number;
  source: {
    kind: SourceKind;
    adapterId: string;
    externalId?: string;
    pointer: string;
  };
  occurredAt: string;
  observedAt: string;
  actor?: Actor;
  context: {
    app?: string;
    windowTitle?: string;
    url?: string;
    project?: string;
    repository?: string;
    threadId?: string;
    conversationId?: string;
  };
  type: EventType;
  content: {
    title?: string;
    text?: string;
    summary?: string;
    rawRef?: string;
    attachments?: AttachmentRef[];
    metadata?: Record<string, unknown>;
  };
  classification?: {
    topics: string[];
    entities: string[];
    intent?: string;
    confidence?: number;
  };
  privacy: {
    sensitivity: Sensitivity;
    retentionPolicyId: string;
    redactionState: "none" | "redacted" | "failed";
  };
  hash: string;
}
