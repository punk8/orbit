import type { Actor, Event, EventType } from "@orbit/core";
import { createStableId, hashObject } from "@orbit/core";
import type { CodexSessionItem } from "./codexSessionReader";

type RawCodexRecord = Record<string, unknown>;

export interface CodexSessionDefaults {
  project?: string;
  repository?: string;
  threadId?: string;
  cwd?: string;
}

export function normalizeCodexSessionItem(
  item: CodexSessionItem,
  adapterId: string,
  defaults: CodexSessionDefaults = {}
): Event {
  const raw = asRecord(item.raw);
  const payload = asRecord(raw.payload);
  const occurredAt =
    firstString(raw.timestamp, payload.timestamp, raw.occurredAt, raw.created_at, raw.createdAt) ??
    nowIso();
  const type = normalizeEventType(firstString(raw.eventType, payload.type, raw.type));
  const text = extractText(raw);
  const title =
    firstString(raw.title, raw.summary, payload.title) ??
    titleFromPayload(raw, payload) ??
    titleFromText(text) ??
    "Codex session event";
  const source: Event["source"] = {
    kind: "codex" as const,
    adapterId,
    pointer: item.pointer
  };
  const externalId = firstString(raw.id, raw.uuid, payload.id, payload.call_id);
  if (externalId) {
    source.externalId = externalId;
  }

  const context: Event["context"] = {
    app: "Codex"
  };
  const project =
    firstString(raw.project, payload.project, raw.workspaceName) ??
    projectFromPath(firstString(payload.cwd, raw.cwd, defaults.cwd)) ??
    defaults.project;
  const repository =
    firstString(raw.repository, payload.repository, raw.repo, payload.repo) ?? defaults.repository;
  const threadId =
    firstString(raw.threadId, payload.threadId, raw.session_id, raw.sessionId) ??
    defaults.threadId;
  if (project) {
    context.project = project;
  }
  if (repository) {
    context.repository = repository;
  }
  if (threadId) {
    context.threadId = threadId;
  }

  const eventInput = {
    source,
    occurredAt,
    type,
    title,
    text,
    position: item.position
  };
  const event: Event = {
    id: createStableId("event", eventInput),
    schemaVersion: 1,
    source,
    occurredAt,
    observedAt: occurredAt,
    context,
    type,
    content: {
      title
    },
    privacy: {
      sensitivity: "internal",
      retentionPolicyId: "default",
      redactionState: "none"
    },
    hash: hashObject(eventInput)
  };

  const actor = normalizeActor(raw);
  if (actor) {
    event.actor = actor;
  }
  if (text) {
    event.content.text = truncateText(text);
  }
  const summary = firstString(raw.summary, payload.summary);
  if (summary && summary !== title) {
    event.content.summary = truncateText(summary);
  }
  const metadata = payloadMetadata(raw, payload);
  if (metadata) {
    event.content.metadata = metadata;
  }
  const topics = normalizeTopics(raw);
  if (topics.length > 0) {
    const classification: NonNullable<Event["classification"]> = {
      topics,
      entities: normalizeEntities(raw)
    };
    const intent = firstString(raw.intent);
    const confidence = firstNumber(raw.confidence);
    if (intent) {
      classification.intent = intent;
    }
    if (confidence !== undefined) {
      classification.confidence = confidence;
    }
    event.classification = classification;
  }

  return event;
}

function normalizeEventType(type: string | undefined): EventType {
  switch (type) {
    case "command":
    case "code_change":
    case "test_result":
    case "decision":
    case "todo":
    case "system":
      return type;
    case "tool_call":
    case "function_call":
    case "function_call_output":
    case "custom_tool_call":
    case "custom_tool_call_output":
    case "patch_apply_end":
      return "command";
    case "session_meta":
    case "task_started":
    case "task_complete":
      return "system";
    case "assistant_message":
    case "user_message":
    case "agent_message":
    case "event_msg":
    case "response_item":
    case "message":
    default:
      return "message";
  }
}

function normalizeActor(raw: RawCodexRecord): Actor | undefined {
  const payload = asRecord(raw.payload);
  const payloadType = firstString(payload.type);
  const role = firstString(raw.role, asRecord(raw.message).role, payload.role);
  if (!role) {
    if (payloadType === "agent_message") return { role: "agent", displayName: "Codex" };
    if (payloadType === "user_message") return { role: "user" };
    return undefined;
  }
  if (role === "assistant") {
    return { role: "agent", displayName: "Codex" };
  }
  if (role === "user") {
    return { role: "user" };
  }
  if (role === "system") {
    return { role: "system" };
  }
  return { displayName: role };
}

function extractText(raw: RawCodexRecord): string | undefined {
  const direct = firstString(raw.text, raw.content, raw.output);
  if (direct) {
    return direct;
  }

  const payload = asRecord(raw.payload);
  const payloadDirect = firstString(payload.text, payload.message, payload.output);
  if (payloadDirect) {
    return payloadDirect;
  }
  if (firstString(payload.type) === "function_call") {
    const name = firstString(payload.name) ?? "function_call";
    const args = firstString(payload.arguments);
    return args ? `${name} ${args}` : name;
  }
  if (firstString(payload.type) === "custom_tool_call") {
    const name = firstString(payload.name) ?? "custom_tool_call";
    const input = firstString(payload.input);
    return input ? `${name} ${input}` : name;
  }
  if (firstString(payload.type) === "custom_tool_call_output") {
    return firstString(payload.output);
  }
  if (firstString(payload.type) === "patch_apply_end") {
    return firstString(payload.stdout, payload.stderr) ?? JSON.stringify(slimPatchResult(payload));
  }
  const sessionMeta = sessionMetadataText(payload);
  if (sessionMeta) {
    return sessionMeta;
  }

  const message = asRecord(raw.message);
  const messageText = contentToText(message.content);
  if (messageText) return messageText;

  const payloadText = contentToText(payload.content);
  if (payloadText) return payloadText;

  return undefined;
}

function normalizeTopics(raw: RawCodexRecord): string[] {
  const topics = raw.topics;
  if (Array.isArray(topics)) {
    return topics.filter((topic): topic is string => typeof topic === "string");
  }
  const topic = firstString(raw.topic);
  return topic ? [topic] : [];
}

function normalizeEntities(raw: RawCodexRecord): string[] {
  const entities = raw.entities;
  return Array.isArray(entities)
    ? entities.filter((entity): entity is string => typeof entity === "string")
    : [];
}

function titleFromText(text: string | undefined): string | undefined {
  if (!text) {
    return undefined;
  }
  const firstLine = text.split("\n").find(Boolean);
  if (!firstLine) {
    return undefined;
  }
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

function titleFromPayload(raw: RawCodexRecord, payload: RawCodexRecord): string | undefined {
  const rawType = firstString(raw.type);
  const payloadType = firstString(payload.type);
  if (rawType === "session_meta") {
    const project = projectFromPath(firstString(payload.cwd));
    return project ? `Codex session started: ${project}` : "Codex session started";
  }
  if (payloadType === "function_call" || payloadType === "custom_tool_call") {
    return `Codex tool call: ${firstString(payload.name) ?? "unknown"}`;
  }
  if (payloadType === "function_call_output" || payloadType === "custom_tool_call_output") {
    return `Codex tool result: ${firstString(payload.call_id) ?? "unknown"}`;
  }
  if (payloadType === "patch_apply_end") {
    return firstString(payload.success) === "true" || payload.success === true
      ? "Codex patch applied"
      : "Codex patch apply result";
  }
  if (payloadType === "task_started") return "Codex task started";
  if (payloadType === "task_complete") return "Codex task completed";
  return undefined;
}

function contentToText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return undefined;
  const parts = value
    .map((part) => {
      if (typeof part === "string") return part;
      const record = asRecord(part);
      return firstString(record.text, record.content) ?? contentToText(record.content);
    })
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("\n") : undefined;
}

function sessionMetadataText(payload: RawCodexRecord): string | undefined {
  if (!firstString(payload.cwd, payload.model_provider, payload.originator, payload.source)) {
    return undefined;
  }
  return [
    firstString(payload.cwd) ? `cwd: ${firstString(payload.cwd)}` : undefined,
    firstString(payload.originator) ? `originator: ${firstString(payload.originator)}` : undefined,
    firstString(payload.model_provider)
      ? `model_provider: ${firstString(payload.model_provider)}`
      : undefined,
    firstString(payload.source) ? `source: ${firstString(payload.source)}` : undefined
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function payloadMetadata(
  raw: RawCodexRecord,
  payload: RawCodexRecord
): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = {};
  const rawType = firstString(raw.type);
  const payloadType = firstString(payload.type);
  const callId = firstString(payload.call_id);
  const toolName = firstString(payload.name);
  const cwd = firstString(payload.cwd);
  const status = firstString(payload.status);
  if (rawType) metadata.codexRecordType = rawType;
  if (payloadType) metadata.codexPayloadType = payloadType;
  if (callId) metadata.callId = callId;
  if (toolName) metadata.toolName = toolName;
  if (cwd) metadata.cwd = cwd;
  if (status) metadata.status = status;
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function slimPatchResult(payload: RawCodexRecord): Record<string, unknown> {
  return {
    success: payload.success,
    status: payload.status,
    changes: Array.isArray(payload.changes) ? payload.changes.length : undefined
  };
}

function projectFromPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  return path.split(/[\\/]/).filter(Boolean).pop();
}

function asRecord(value: unknown): RawCodexRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RawCodexRecord)
    : {};
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

function firstNumber(...values: unknown[]): number | undefined {
  return values.find((value): value is number => typeof value === "number");
}

function truncateText(value: string, maxLength = 4000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function nowIso(): string {
  return new Date().toISOString();
}
