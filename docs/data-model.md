# Data Model

## Design Rules

- Use stable IDs and explicit version fields.
- Every derived object must keep evidence references.
- Raw payloads should be optional and governed by retention policy.
- Data models should support local-first storage and later sync without changing IDs.
- Human-readable Knowledge and Memory files should be reconstructable from database rows.

## Common Types

```ts
type ID = string;

type SourceKind =
  | "codex"
  | "local_agent"
  | "seatalk"
  | "desktop"
  | "accessibility"
  | "screen"
  | "audio"
  | "browser"
  | "calendar"
  | "mail"
  | "docs"
  | "jira"
  | "gitlab"
  | "filesystem";

type Sensitivity = "public" | "internal" | "confidential" | "secret";

type ReviewStatus = "draft" | "needs_review" | "confirmed" | "rejected" | "archived";

interface EvidenceRef {
  eventId?: ID;
  activitySessionId?: ID;
  artifactId?: ID;
  sourceKind: SourceKind;
  sourcePointer: string;
  timestamp: string;
  excerpt?: string;
}

interface AttachmentRef {
  id: ID;
  kind: "file" | "image" | "audio" | "video" | "link" | "other";
  name?: string;
  mimeType?: string;
  localRef?: string;
  sourcePointer?: string;
  sizeBytes?: number;
  hash?: string;
}

interface FollowUp {
  id: ID;
  title: string;
  owner?: string;
  dueAt?: string;
  status: "open" | "done" | "dismissed";
  evidence: EvidenceRef[];
}
```

## Source Adapter

```ts
interface SourceAdapter {
  id: string;
  kind: SourceKind;
  displayName: string;
  capabilities: SourceCapability[];
  defaultSensitivity: Sensitivity;
  readCursor(cursor?: string): Promise<AdapterReadResult>;
}

type SourceCapability =
  | "incremental_read"
  | "thread_metadata"
  | "attachments"
  | "raw_export"
  | "delete_detection";

interface AdapterReadResult {
  events: Event[];
  nextCursor?: string;
  warnings?: string[];
}
```

## Event

Event is the immutable fact layer.

```ts
interface Event {
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
  actor?: {
    id?: string;
    displayName?: string;
    role?: "user" | "teammate" | "agent" | "system";
  };
  context: {
    app?: string;
    windowTitle?: string;
    url?: string;
    project?: string;
    repository?: string;
    threadId?: string;
    conversationId?: string;
  };
  type:
  | "message"
  | "command"
  | "code_change"
  | "test_result"
  | "meeting"
  | "app_focus"
  | "window_focus"
  | "window_title_change"
  | "accessibility_snapshot"
  | "browser_navigation"
  | "terminal_command"
  | "terminal_output_summary"
  | "clipboard_change"
  | "file_activity"
  | "screen_observation"
  | "ocr_text"
  | "audio_segment"
  | "transcript_segment"
  | "observation_state"
  | "permission_state"
  | "file_change"
  | "decision"
    | "todo"
    | "system";
  content: {
    title?: string;
    text?: string;
    summary?: string;
    rawRef?: string;
    attachments?: AttachmentRef[];
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
```

## Activity Session

Activity Session groups related Events into a meaningful work segment.

```ts
interface ActivitySession {
  id: ID;
  schemaVersion: number;
  title: string;
  startAt: string;
  endAt: string;
  durationSeconds: number;
  sourceKinds: SourceKind[];
  apps: string[];
  eventCount: number;
  eventIds: ID[];
  topic?: string;
  project?: string;
  summary?: string;
  evidence: EvidenceRef[];
  media?: {
    screenshotRefs?: string[];
    recordingRefs?: string[];
    transcriptRefs?: string[];
  };
  localState: {
    rawAvailable: boolean;
    indexed: boolean;
    storageBytes?: number;
  };
  privacy: {
    sensitivity: Sensitivity;
    retentionPolicyId: string;
  };
  createdAt: string;
  updatedAt: string;
}
```

## Knowledge Artifact

Knowledge Artifact is the reviewable knowledge-document layer.

```ts
interface KnowledgeArtifact {
  id: ID;
  schemaVersion: number;
  type:
    | "daily_brief"
    | "weekly_review"
    | "meeting_summary"
    | "debugging_note"
    | "decision_record"
    | "project_context"
    | "follow_up_list"
    | "custom";
  title: string;
  status: ReviewStatus;
  metadata: {
    timeWindow?: { startAt: string; endAt: string };
    apps: string[];
    projects: string[];
    sourceSessionIds: ID[];
    generatedBy?: string;
    language?: string;
  };
  content: {
    description: string;
    keyInsights: string[];
    decisions?: string[];
    blockers?: string[];
    followUps?: FollowUp[];
    markdown: string;
  };
  evidence: EvidenceRef[];
  memoryCandidateIds?: ID[];
  confidence: number;
  createdAt: string;
  updatedAt: string;
}
```

## Memory

Memory is the long-lived, compact recall layer.

```ts
interface Memory {
  id: ID;
  schemaVersion: number;
  kind:
    | "project_fact"
    | "user_preference"
    | "decision"
    | "workflow_pattern"
    | "common_issue"
    | "relationship_context"
    | "domain_knowledge";
  title: string;
  body: string;
  status: ReviewStatus;
  scope: {
    global?: boolean;
    project?: string;
    sourceKinds?: SourceKind[];
  };
  tags: string[];
  evidence: EvidenceRef[];
  confidence: number;
  validFrom?: string;
  validUntil?: string;
  lastReviewedAt?: string;
  supersedes?: ID[];
  createdAt: string;
  updatedAt: string;
}
```

## Recommendation

Recommendation is an explainable suggestion, not an automatic action.

```ts
interface Recommendation {
  id: ID;
  schemaVersion: number;
  type:
    | "follow_up"
    | "risk"
    | "blocker"
    | "automation_opportunity"
    | "recurring_pattern"
    | "context_needed";
  title: string;
  explanation: string;
  suggestedAction: string;
  confidence: number;
  impact: "low" | "medium" | "high";
  status: "new" | "accepted" | "dismissed" | "snoozed" | "resolved";
  evidence: EvidenceRef[];
  createdAt: string;
  dueAt?: string;
}
```

## Storage Mapping

Recommended local layout:

```text
~/Library/Application Support/Orbit/
  orbit.db
  artifacts/
    knowledge/
      <artifact-id>.md
      <artifact-id>.json
    memory/
      <memory-id>.md
      <memory-id>.json
  raw/
    <source-kind>/
      <content-hash>
  media/
    screenshots/
    recordings/
    transcripts/
  indexes/
  logs/
```

SQLite should hold queryable metadata, relationships, status, hashes, and FTS indexes. Markdown/JSON files should remain the source for user-readable Knowledge and Memory content.

## State Transitions

Knowledge Artifact:

```text
draft -> needs_review -> confirmed -> archived
draft -> rejected
needs_review -> rejected
```

Memory:

```text
draft -> needs_review -> confirmed
confirmed -> archived
confirmed -> needs_review
```

Recommendation:

```text
new -> accepted -> resolved
new -> dismissed
new -> snoozed -> new
```
