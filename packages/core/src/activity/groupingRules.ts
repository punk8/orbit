import type { Event } from "../types/event";

export function activityGroupKey(event: Event): string {
  const date = event.occurredAt.slice(0, 10);
  const project = event.context.project ?? "unknown-project";
  const thread =
    event.context.threadId ??
    event.context.conversationId ??
    event.context.repository ??
    event.source.adapterId;
  return `${date}|${project}|${thread}`;
}
