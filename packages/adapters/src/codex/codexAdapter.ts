import type { AdapterReadResult, PermissionScope, Sensitivity, SourceAdapter } from "@orbit/core";
import { defaultPermissionScopeForSource } from "@orbit/core";
import { normalizeCodexSessionItem, type CodexSessionDefaults } from "./codexNormalizer";
import type { CodexSessionItem } from "./codexSessionReader";
import { readCodexSessionItemsWithWarnings } from "./codexSessionReader";

export interface CodexAdapterOptions {
  path: string;
  id?: string;
  displayName?: string;
  defaultSensitivity?: Sensitivity;
}

export class CodexAdapter implements SourceAdapter {
  readonly id: string;
  readonly kind = "codex" as const;
  readonly displayName: string;
  readonly capabilities = ["incremental_read", "thread_metadata"] as const;
  readonly defaultSensitivity: Sensitivity;
  readonly permissionScope: PermissionScope;

  constructor(private readonly options: CodexAdapterOptions) {
    this.id = options.id ?? "codex_local";
    this.displayName = options.displayName ?? "Codex Local Sessions";
    this.defaultSensitivity = options.defaultSensitivity ?? "internal";
    this.permissionScope = defaultPermissionScopeForSource(this.kind, this.defaultSensitivity);
  }

  async readCursor(cursor?: string): Promise<AdapterReadResult> {
    const start = cursor ? Number.parseInt(cursor, 10) : 0;
    const { items, warnings } = readCodexSessionItemsWithWarnings(this.options.path);
    const safeStart = Number.isFinite(start) && start > 0 ? start : 0;
    const defaultsByFile = buildDefaultsByFile(items);
    const selected = items.slice(safeStart).filter(isIngestibleCodexSessionItem);
    return {
      events: selected.map((item) =>
        normalizeCodexSessionItem(item, this.id, defaultsByFile.get(item.filePath))
      ),
      nextCursor: String(items.length),
      warnings
    };
  }
}

function isIngestibleCodexSessionItem(item: CodexSessionItem): boolean {
  const raw = asRecord(item.raw);
  const payload = asRecord(raw.payload);
  const rawType = firstString(raw.type);
  const payloadType = firstString(payload.type);
  const role = firstString(payload.role, asRecord(raw.message).role, raw.role);

  if (rawType === "turn_context") return false;
  if (payloadType === "token_count" || payloadType === "reasoning") return false;
  if (payloadType === "message" && (role === "developer" || role === "system")) return false;
  if (rawType === "event_msg" && (payloadType === "user_message" || payloadType === "agent_message")) {
    return false;
  }

  return true;
}

function buildDefaultsByFile(items: CodexSessionItem[]): Map<string, CodexSessionDefaults> {
  const defaultsByFile = new Map<string, CodexSessionDefaults>();
  for (const item of items) {
    const raw = asRecord(item.raw);
    const payload = asRecord(raw.payload);
    const existing = defaultsByFile.get(item.filePath) ?? {};
    const cwd = existing.cwd ?? firstString(payload.cwd, raw.cwd);
    const threadId =
      existing.threadId ?? firstString(raw.threadId, payload.threadId, raw.session_id, payload.id);
    const project =
      existing.project ??
      firstString(raw.project, payload.project, raw.workspaceName) ??
      projectFromPath(cwd);
    const repository =
      existing.repository ?? firstString(raw.repository, payload.repository, raw.repo, payload.repo);
    defaultsByFile.set(item.filePath, withoutUndefined({ cwd, threadId, project, repository }));
  }
  return defaultsByFile;
}

function projectFromPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  return path.split(/[\\/]/).filter(Boolean).pop();
}

function withoutUndefined(input: Record<string, string | undefined>): CodexSessionDefaults {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => entry[1] !== undefined)
  ) as CodexSessionDefaults;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}
