import type { AdapterReadResult, Sensitivity, SourceAdapter } from "@orbit/core";
import { normalizeCodexSessionItem } from "./codexNormalizer";
import { readCodexSessionItems } from "./codexSessionReader";

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

  constructor(private readonly options: CodexAdapterOptions) {
    this.id = options.id ?? "codex_local";
    this.displayName = options.displayName ?? "Codex Local Sessions";
    this.defaultSensitivity = options.defaultSensitivity ?? "internal";
  }

  async readCursor(cursor?: string): Promise<AdapterReadResult> {
    const start = cursor ? Number.parseInt(cursor, 10) : 0;
    const items = readCodexSessionItems(this.options.path);
    const safeStart = Number.isFinite(start) && start > 0 ? start : 0;
    const selected = items.slice(safeStart);
    return {
      events: selected.map((item) => normalizeCodexSessionItem(item, this.id)),
      nextCursor: String(items.length)
    };
  }
}
