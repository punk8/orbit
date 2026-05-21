import type { PermissionScope, SourceKind } from "@orbit/core";

export function perceptionPermissionScope(
  sourceKind: Extract<SourceKind, "screen" | "ocr" | "audio" | "transcript">,
  options: {
    canStoreRaw?: boolean;
    canUseForAI?: boolean;
    canExportToAgent?: boolean;
    retentionPolicyId?: string;
  } = {}
): PermissionScope {
  return {
    sourceKind,
    readableFields: ["title", "summary", "timestamp", "app", "window", "thread"],
    canStoreRaw: options.canStoreRaw ?? false,
    canStoreSummary: true,
    canUseForAI: options.canUseForAI ?? false,
    canExportToAgent: options.canExportToAgent ?? false,
    retentionPolicyId: options.retentionPolicyId ?? "perception_summary_only"
  };
}
