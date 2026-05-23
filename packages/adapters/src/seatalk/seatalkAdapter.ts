import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type {
  AdapterReadResult,
  Event,
  PermissionScope,
  Sensitivity,
  SourceAdapter
} from "@orbit/core";
import { createStableId, defaultPermissionScopeForSource, hashObject } from "@orbit/core";
import {
  normalizeApprovedSeaTalkRecord,
  type ApprovedSeaTalkImportRecord
} from "./seatalkNormalizer";

export interface SeaTalkAdapterOptions {
  approvedImportDirectory: string;
  id?: string;
  displayName?: string;
  defaultSensitivity?: Sensitivity;
}

export class SeaTalkAdapter implements SourceAdapter {
  readonly id: string;
  readonly kind = "seatalk" as const;
  readonly displayName: string;
  readonly capabilities = ["incremental_read", "thread_metadata"] as const;
  readonly defaultSensitivity: Sensitivity;
  readonly permissionScope: PermissionScope;

  constructor(private readonly options: SeaTalkAdapterOptions) {
    this.id = options.id ?? "seatalk_approved_import";
    this.displayName = options.displayName ?? "SeaTalk Approved Import";
    this.defaultSensitivity = options.defaultSensitivity ?? "confidential";
    this.permissionScope = defaultPermissionScopeForSource(this.kind, this.defaultSensitivity);
  }

  async readCursor(cursor?: string): Promise<AdapterReadResult> {
    const read = readApprovedImportItems(this.options.approvedImportDirectory);
    const start = cursor ? Number.parseInt(cursor, 10) : 0;
    const safeStart = Number.isFinite(start) && start > 0 ? start : 0;
    const selected = read.items.slice(safeStart);
    const output: AdapterReadResult = {
      events: selected.map((item) => this.toEvent(item)),
      nextCursor: String(read.items.length)
    };
    const warnings =
      read.items.length === 0
        ? ["SeaTalk adapter is limited to explicit approved imports; no records were found."]
        : read.warnings;
    if (warnings && warnings.length > 0) {
      output.warnings = warnings;
    }
    return output;
  }

  private toEvent(item: ApprovedSeaTalkImportItem): Event {
    const record = normalizeApprovedSeaTalkRecord(item.record);
    const eventInput = {
      adapterId: this.id,
      pointer: item.pointer,
      externalId: record.externalId,
      occurredAt: record.occurredAt,
      type: record.type,
      title: record.title,
      text: record.text,
      summary: record.summary
    };
    const source: Event["source"] = {
      kind: "seatalk" as const,
      adapterId: this.id,
      pointer: item.pointer
    };
    if (record.externalId) source.externalId = record.externalId;
    const event: Event = {
      id: createStableId("event", eventInput),
      schemaVersion: 1 as const,
      source,
      occurredAt: record.occurredAt,
      observedAt: record.occurredAt,
      context: {
        app: "SeaTalk",
        ...record.context
      },
      type: record.type,
      content: {},
      privacy: {
        sensitivity: record.sensitivity ?? this.defaultSensitivity,
        retentionPolicyId: "default",
        redactionState: "none" as const
      },
      hash: hashObject(eventInput)
    };
    if (record.actor) event.actor = record.actor;
    if (record.title) event.content.title = record.title;
    if (record.text) event.content.text = record.text;
    if (record.summary) event.content.summary = record.summary;
    if (record.classification) event.classification = record.classification;
    return event;
  }
}

interface ApprovedSeaTalkImportItem {
  record: ApprovedSeaTalkImportRecord;
  pointer: string;
}

function readApprovedImportItems(directory: string): {
  items: ApprovedSeaTalkImportItem[];
  warnings: string[];
} {
  if (!existsSync(directory)) {
    return { items: [], warnings: [`Approved SeaTalk import path not found: ${directory}`] };
  }
  const files = statSync(directory).isDirectory()
    ? collectImportFiles(directory)
    : [directory].filter(isImportFile);
  const result: { items: ApprovedSeaTalkImportItem[]; warnings: string[] } = {
    items: [],
    warnings: []
  };
  for (const file of files) {
    const fileResult = readApprovedImportFile(directory, file);
    result.items.push(...fileResult.items);
    result.warnings.push(...fileResult.warnings);
  }
  return result;
}

function collectImportFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) return collectImportFiles(entryPath);
      return isImportFile(entryPath) ? [entryPath] : [];
    })
    .sort();
}

function isImportFile(path: string): boolean {
  return path.endsWith(".jsonl") || path.endsWith(".json");
}

function readApprovedImportFile(
  rootPath: string,
  filePath: string
): {
  items: ApprovedSeaTalkImportItem[];
  warnings: string[];
} {
  const content = readFileSync(filePath, "utf8").trim();
  if (!content) return { items: [], warnings: [] };
  const pointer = relativePointer(rootPath, filePath);
  if (filePath.endsWith(".jsonl")) {
    const result: { items: ApprovedSeaTalkImportItem[]; warnings: string[] } = {
      items: [],
      warnings: []
    };
    content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line, index) => {
        try {
          result.items.push({
            record: JSON.parse(line) as ApprovedSeaTalkImportRecord,
            pointer: `seatalk://approved-import/${pointer}#${index + 1}`
          });
        } catch (error) {
          result.warnings.push(
            `Skipped invalid SeaTalk import record at ${pointer}:${index + 1}: ${
              error instanceof Error ? error.message : "unknown parse error"
            }`
          );
        }
      });
    return result;
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    const records = Array.isArray(parsed) ? parsed : [parsed];
    return {
      items: records.map((record, index) => ({
        record: record as ApprovedSeaTalkImportRecord,
        pointer: `seatalk://approved-import/${pointer}#${index + 1}`
      })),
      warnings: []
    };
  } catch (error) {
    return {
      items: [],
      warnings: [
        `Skipped invalid SeaTalk import file ${pointer}: ${
          error instanceof Error ? error.message : "unknown parse error"
        }`
      ]
    };
  }
}

function relativePointer(rootPath: string, filePath: string): string {
  if (rootPath === filePath) return basename(filePath);
  return relative(rootPath, filePath) || basename(filePath);
}
