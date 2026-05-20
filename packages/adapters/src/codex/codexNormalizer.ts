import type { Actor, Event, EventType } from "@orbit/core";
import { createStableId, hashObject } from "@orbit/core";
import type { CodexSessionItem } from "./codexSessionReader";

type RawCodexRecord = Record<string, unknown>;

export function normalizeCodexSessionItem(item: CodexSessionItem, adapterId: string): Event {
  const raw = asRecord(item.raw);
  const occurredAt =
    firstString(raw.timestamp, raw.occurredAt, raw.created_at, raw.createdAt) ?? nowIso();
  const type = normalizeEventType(firstString(raw.type, raw.eventType));
  const text = extractText(raw);
  const title = firstString(raw.title, raw.summary) ?? titleFromText(text) ?? "Codex session event";
  const source: Event["source"] = {
    kind: "codex" as const,
    adapterId,
    pointer: item.pointer
  };
  const externalId = firstString(raw.id, raw.uuid);
  if (externalId) {
    source.externalId = externalId;
  }

  const context: Event["context"] = {
    app: "Codex"
  };
  const project = firstString(raw.project, raw.workspaceName);
  const repository = firstString(raw.repository, raw.repo);
  const threadId = firstString(raw.threadId, raw.session_id, raw.sessionId);
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
    event.content.text = text;
  }
  const summary = firstString(raw.summary);
  if (summary && summary !== title) {
    event.content.summary = summary;
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
      return "command";
    case "assistant_message":
    case "user_message":
    case "message":
    default:
      return "message";
  }
}

function normalizeActor(raw: RawCodexRecord): Actor | undefined {
  const role = firstString(raw.role, asRecord(raw.message).role);
  if (!role) {
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

  const message = asRecord(raw.message);
  const messageContent = message.content;
  if (typeof messageContent === "string") {
    return messageContent;
  }
  if (Array.isArray(messageContent)) {
    return messageContent
      .map((part) => {
        if (typeof part === "string") return part;
        const record = asRecord(part);
        return firstString(record.text, record.content);
      })
      .filter((part): part is string => Boolean(part))
      .join("\n");
  }

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

function nowIso(): string {
  return new Date().toISOString();
}
