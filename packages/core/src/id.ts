import { randomUUID } from "node:crypto";
import { hashObject } from "./hash";

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function createStableId(prefix: string, value: unknown): string {
  return `${prefix}_${hashObject(value).slice(0, 24)}`;
}
