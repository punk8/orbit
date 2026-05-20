import type { AdapterReadResult, Sensitivity, SourceAdapter } from "@orbit/core";
import { readSessionItems } from "../codex/codexSessionReader";
import { normalizeLocalAgentSessionItem } from "./localAgentNormalizer";

export interface LocalAgentAdapterOptions {
  path: string;
  id?: string;
  displayName?: string;
  defaultApp?: string;
  defaultSensitivity?: Sensitivity;
}

export class LocalAgentAdapter implements SourceAdapter {
  readonly id: string;
  readonly kind = "local_agent" as const;
  readonly displayName: string;
  readonly capabilities = ["incremental_read", "thread_metadata"] as const;
  readonly defaultSensitivity: Sensitivity;

  constructor(private readonly options: LocalAgentAdapterOptions) {
    this.id = options.id ?? "local_agent";
    this.displayName = options.displayName ?? "Local Agent Sessions";
    this.defaultSensitivity = options.defaultSensitivity ?? "internal";
  }

  async readCursor(cursor?: string): Promise<AdapterReadResult> {
    const start = cursor ? Number.parseInt(cursor, 10) : 0;
    const { items, warnings } = readSessionItems(this.options.path, "local-agent");
    const safeStart = Number.isFinite(start) && start > 0 ? start : 0;
    const selected = items.slice(safeStart);
    const defaultApp = this.options.defaultApp ?? "Local Agent";
    return {
      events: selected.map((item) => normalizeLocalAgentSessionItem(item, this.id, defaultApp)),
      nextCursor: String(items.length),
      warnings
    };
  }
}
