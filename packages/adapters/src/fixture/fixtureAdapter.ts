import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import type {
  AdapterReadResult,
  Event,
  PermissionScope,
  Sensitivity,
  SourceAdapter,
  SourceKind
} from "@orbit/core";
import { createStableId, defaultPermissionScopeForSource, hashObject } from "@orbit/core";
import type { FixtureReadItem, FixtureRecord } from "./fixtureTypes";

export interface FixtureAdapterOptions {
  kind: SourceKind;
  directory: string;
  id?: string;
  displayName?: string;
  defaultSensitivity?: Sensitivity;
}

export class FixtureAdapter implements SourceAdapter {
  readonly id: string;
  readonly kind: SourceKind;
  readonly displayName: string;
  readonly capabilities = ["incremental_read"] as const;
  readonly defaultSensitivity: Sensitivity;
  readonly permissionScope: PermissionScope;

  constructor(private readonly options: FixtureAdapterOptions) {
    this.kind = options.kind;
    this.id = options.id ?? `fixture_${options.kind}`;
    this.displayName = options.displayName ?? `Fixture ${options.kind}`;
    this.defaultSensitivity =
      options.defaultSensitivity ?? (options.kind === "seatalk" ? "confidential" : "internal");
    this.permissionScope = defaultPermissionScopeForSource(this.kind, this.defaultSensitivity);
  }

  async readCursor(cursor?: string): Promise<AdapterReadResult> {
    const start = cursor ? Number.parseInt(cursor, 10) : 0;
    const items = readFixtureItems(this.options.directory).filter(
      (item) => item.record.sourceKind === this.kind
    );
    const safeStart = Number.isFinite(start) && start > 0 ? start : 0;
    const selected = items.slice(safeStart);
    const events = selected.map((item) => this.toEvent(item));

    return {
      events,
      nextCursor: String(items.length)
    };
  }

  private toEvent(item: FixtureReadItem): Event {
    const record = item.record;
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
      kind: record.sourceKind,
      adapterId: this.id,
      externalId: record.externalId,
      pointer: item.pointer
    };
    const event: Event = {
      id: createStableId("event", eventInput),
      schemaVersion: 1,
      source,
      occurredAt: record.occurredAt,
      observedAt: record.occurredAt,
      context: record.context ?? {},
      type: record.type,
      content: {},
      privacy: {
        sensitivity: record.sensitivity ?? this.defaultSensitivity,
        retentionPolicyId: "default",
        redactionState: "none"
      },
      hash: hashObject(eventInput)
    };

    if (record.actor) {
      event.actor = record.actor;
    }
    if (record.title) {
      event.content.title = record.title;
    }
    if (record.text) {
      event.content.text = record.text;
    }
    if (record.summary) {
      event.content.summary = record.summary;
    }
    if (record.classification) {
      event.classification = record.classification;
    }

    return event;
  }
}

export function readFixtureItems(directory: string): FixtureReadItem[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory)
    .filter((file) => file.endsWith(".jsonl"))
    .sort()
    .flatMap((file) => {
      const filePath = join(directory, file);
      const lines = readFileSync(filePath, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      return lines.map((line, index) => ({
        record: JSON.parse(line) as FixtureRecord,
        pointer: `fixture://${basename(directory)}/${file}#${index + 1}`
      }));
    });
}
