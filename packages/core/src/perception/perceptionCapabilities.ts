export interface PerceptionCapabilityDescriptor {
  sourceKind: "screen" | "audio";
  displayName: string;
  status: "research_only";
  capturesRawMedia: false;
  enabledByDefault: false;
  requiresExplicitPermission: true;
  defaultAgentExport: false;
}

export const perceptionCapabilityDescriptors: readonly PerceptionCapabilityDescriptor[] = [
  {
    sourceKind: "screen",
    displayName: "Screen perception",
    status: "research_only",
    capturesRawMedia: false,
    enabledByDefault: false,
    requiresExplicitPermission: true,
    defaultAgentExport: false
  },
  {
    sourceKind: "audio",
    displayName: "Audio perception",
    status: "research_only",
    capturesRawMedia: false,
    enabledByDefault: false,
    requiresExplicitPermission: true,
    defaultAgentExport: false
  }
];
