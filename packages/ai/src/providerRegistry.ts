import {
  createDefaultPerceptionStatus,
  type PerceptionControlPlaneStatus,
  type PerceptionProviderKind,
  type PerceptionProviderTask,
  type PerceptionResourcePolicy,
  type PerceptionSourceKind
} from "@orbit/core";
import type { AIProviderConfig, AIProviderKind, OpenAICompatibleTokenLimitParameter } from ".";

export type AIProviderRuntimeTask =
  | "knowledge_draft"
  | "vision_summary"
  | "ocr_postprocess"
  | "transcription"
  | "memory_candidate"
  | "recommendation"
  | "context_compression";

export type AIProviderRuntimeProviderKind = PerceptionProviderKind;

export type AIProviderRuntimeState =
  | "ready"
  | "disabled"
  | "skipped_by_policy"
  | "missing_configuration"
  | "not_implemented";

export interface AIProviderRuntimeConfiguration {
  hasBaseUrl: boolean;
  hasModel: boolean;
  hasApiKey: boolean;
  tokenLimitParameter?: OpenAICompatibleTokenLimitParameter;
}

export interface AIProviderRuntimeBudget {
  maxRequestsPerHour: number;
  maxInputCharsPerRequest: number;
  maxTokensPerHour: number;
  allowExternalByDefault: boolean;
}

export interface AIProviderTaskResolution {
  task: AIProviderRuntimeTask;
  providerKind: AIProviderRuntimeProviderKind;
  state: AIProviderRuntimeState;
  enabled: boolean;
  external: boolean;
  allowExternal: boolean;
  implemented: boolean;
  reason: string;
  sourceKinds: PerceptionSourceKind[];
  blockedByPolicySourceKinds: PerceptionSourceKind[];
  model?: string;
  routeTask?: PerceptionProviderTask;
  configuration?: AIProviderRuntimeConfiguration;
  budget?: AIProviderRuntimeBudget;
}

export interface AIProviderRuntimeRegistry {
  generatedAt: string;
  tasks: AIProviderTaskResolution[];
  summary: Record<AIProviderRuntimeState, number>;
}

export interface AIProviderRuntimeRegistryInput {
  aiProviderConfig?: AIProviderConfig;
  perceptionStatus?: PerceptionControlPlaneStatus;
  generatedAt?: string;
}

export const aiProviderRuntimeTasks: readonly AIProviderRuntimeTask[] = [
  "knowledge_draft",
  "vision_summary",
  "ocr_postprocess",
  "transcription",
  "memory_candidate",
  "recommendation",
  "context_compression"
];

export function buildAIProviderRuntimeRegistry(
  input: AIProviderRuntimeRegistryInput = {}
): AIProviderRuntimeRegistry {
  const aiProviderConfig = input.aiProviderConfig ?? { kind: "disabled" as const };
  const perceptionStatus = input.perceptionStatus ?? createDefaultPerceptionStatus();
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const budget = providerBudget(perceptionStatus.resourcePolicy.provider);
  const tasks = aiProviderRuntimeTasks.map((task) =>
    resolveTask(task, aiProviderConfig, perceptionStatus, budget)
  );
  return {
    generatedAt,
    tasks,
    summary: summarizeTasks(tasks)
  };
}

export function isAIProviderRuntimeTask(value: unknown): value is AIProviderRuntimeTask {
  return (
    value === "knowledge_draft" ||
    value === "vision_summary" ||
    value === "ocr_postprocess" ||
    value === "transcription" ||
    value === "memory_candidate" ||
    value === "recommendation" ||
    value === "context_compression"
  );
}

export function requireAIProviderRuntimeTask(value: unknown): AIProviderRuntimeTask {
  if (isAIProviderRuntimeTask(value)) return value;
  throw new Error(`Unsupported AI provider task: ${String(value)}`);
}

function resolveTask(
  task: AIProviderRuntimeTask,
  aiProviderConfig: AIProviderConfig,
  perceptionStatus: PerceptionControlPlaneStatus,
  budget: AIProviderRuntimeBudget
): AIProviderTaskResolution {
  if (task === "vision_summary") {
    return resolvePerceptionTask(task, "vision", ["screen", "vision"], aiProviderConfig, {
      perceptionStatus,
      budget,
      implementedProviderKinds: ["mock", "openai-compatible"],
      plannedReason:
        "Vision route is registered; local/image-byte provider paths are implemented in later Goal 9 checkpoints."
    });
  }
  if (task === "ocr_postprocess") {
    return resolvePerceptionTask(task, "ocr", ["ocr"], aiProviderConfig, {
      perceptionStatus,
      budget,
      implementedProviderKinds: ["mock"],
      plannedReason:
        "OCR post-processing route is registered; real local/OpenAI-compatible OCR providers land in Goal 9C."
    });
  }
  if (task === "transcription") {
    return resolvePerceptionTask(
      task,
      "transcription",
      ["microphone_audio", "transcript"],
      aiProviderConfig,
      {
        perceptionStatus,
        budget,
        implementedProviderKinds: ["mock", "openai-compatible"],
        plannedReason:
          "Transcription route is registered; local transcription provider setup lands in a later checkpoint."
      }
    );
  }
  return resolveGeneralTask(task, aiProviderConfig, budget);
}

function resolveGeneralTask(
  task: AIProviderRuntimeTask,
  config: AIProviderConfig,
  budget: AIProviderRuntimeBudget
): AIProviderTaskResolution {
  const providerKind = normalizeGeneralProviderKind(config.kind);
  const base = baseResolution(task, providerKind, [], budget);
  const configuration = providerConfiguration(config);
  if (providerKind === "disabled") {
    return {
      ...base,
      state: "disabled",
      reason: "Provider is disabled.",
      configuration
    };
  }
  const missing = missingOpenAIConfiguration(providerKind, configuration);
  if (missing) {
    return {
      ...base,
      state: "missing_configuration",
      enabled: false,
      external: providerKind === "openai-compatible",
      allowExternal: providerKind === "openai-compatible",
      reason: missing,
      configuration
    };
  }
  const implemented = task === "knowledge_draft";
  if (!implemented) {
    return {
      ...base,
      state: "not_implemented",
      enabled: false,
      external: providerKind === "openai-compatible",
      allowExternal: providerKind === "openai-compatible",
      implemented,
      reason: `${task} is registered, but its model runner is not implemented yet.`,
      ...(config.model ? { model: config.model } : {}),
      configuration
    };
  }
  return {
    ...base,
    state: "ready",
    enabled: true,
    external: providerKind === "openai-compatible",
    allowExternal: providerKind === "openai-compatible",
    implemented,
    reason:
      providerKind === "mock"
        ? "Mock provider is ready for synthetic and deterministic Knowledge drafting."
        : "OpenAI-compatible provider is configured for reviewable Knowledge drafting.",
    ...(config.model ? { model: config.model } : {}),
    configuration
  };
}

function resolvePerceptionTask(
  task: AIProviderRuntimeTask,
  routeTask: PerceptionProviderTask,
  sourceKinds: PerceptionSourceKind[],
  config: AIProviderConfig,
  options: {
    perceptionStatus: PerceptionControlPlaneStatus;
    budget: AIProviderRuntimeBudget;
    implementedProviderKinds: AIProviderRuntimeProviderKind[];
    plannedReason: string;
  }
): AIProviderTaskResolution {
  const route = options.perceptionStatus.providerRoutes.find((item) => item.task === routeTask);
  const providerKind = route?.provider ?? "disabled";
  const base = baseResolution(task, providerKind, sourceKinds, options.budget);
  const configuration = providerConfiguration(config);
  const routeDetails = {
    routeTask,
    ...(route?.model ? { model: route.model } : {})
  };
  if (!route || providerKind === "disabled" || route.enabled === false) {
    return {
      ...base,
      ...routeDetails,
      state: "disabled",
      reason: `${routeTask} provider route is disabled.`,
      configuration
    };
  }

  const blockedByPolicySourceKinds = sourceKinds.filter(
    (sourceKind) =>
      options.perceptionStatus.sources.find((source) => source.sourceKind === sourceKind)?.policy
        .canUseForAI !== true
  );
  if (blockedByPolicySourceKinds.length > 0) {
    return {
      ...base,
      ...routeDetails,
      state: "skipped_by_policy",
      enabled: false,
      external: providerKind === "openai-compatible",
      allowExternal: route.allowExternal,
      blockedByPolicySourceKinds,
      reason: `AI use is blocked by source policy: ${blockedByPolicySourceKinds.join(", ")}.`,
      configuration
    };
  }

  if (providerKind === "openai-compatible" && route.allowExternal !== true) {
    return {
      ...base,
      ...routeDetails,
      state: "skipped_by_policy",
      enabled: false,
      external: true,
      allowExternal: false,
      reason: "External provider use is blocked by perception provider route policy.",
      configuration
    };
  }

  const missing = missingOpenAIConfiguration(providerKind, configuration);
  if (missing) {
    return {
      ...base,
      ...routeDetails,
      state: "missing_configuration",
      enabled: false,
      external: providerKind === "openai-compatible",
      allowExternal: route.allowExternal,
      reason: missing,
      configuration
    };
  }

  const implemented = options.implementedProviderKinds.includes(providerKind);
  if (!implemented) {
    return {
      ...base,
      ...routeDetails,
      state: "not_implemented",
      enabled: false,
      external: providerKind === "openai-compatible",
      allowExternal: route.allowExternal,
      implemented,
      reason: options.plannedReason,
      configuration
    };
  }

  return {
    ...base,
    ...routeDetails,
    state: "ready",
    enabled: true,
    external: providerKind === "openai-compatible",
    allowExternal: route.allowExternal,
    implemented,
    reason:
      providerKind === "mock"
        ? `${routeTask} mock provider route is ready.`
        : `${routeTask} OpenAI-compatible provider route is ready.`,
    ...((route?.model ?? config.model) ? { model: route?.model ?? config.model } : {}),
    configuration
  };
}

function baseResolution(
  task: AIProviderRuntimeTask,
  providerKind: AIProviderRuntimeProviderKind,
  sourceKinds: PerceptionSourceKind[],
  budget: AIProviderRuntimeBudget
): AIProviderTaskResolution {
  return {
    task,
    providerKind,
    state: "disabled",
    enabled: false,
    external: false,
    allowExternal: false,
    implemented: false,
    reason: "Provider is disabled.",
    sourceKinds,
    blockedByPolicySourceKinds: [],
    budget
  };
}

function normalizeGeneralProviderKind(kind: AIProviderKind): AIProviderRuntimeProviderKind {
  if (kind === "mock" || kind === "openai-compatible") return kind;
  return "disabled";
}

function providerConfiguration(config: AIProviderConfig): AIProviderRuntimeConfiguration {
  return {
    hasBaseUrl: Boolean(config.baseUrl?.trim()),
    hasModel: Boolean(config.model?.trim()),
    hasApiKey: Boolean(config.apiKey?.trim()),
    ...(config.tokenLimitParameter ? { tokenLimitParameter: config.tokenLimitParameter } : {})
  };
}

function missingOpenAIConfiguration(
  providerKind: AIProviderRuntimeProviderKind,
  configuration: AIProviderRuntimeConfiguration
): string | undefined {
  if (providerKind !== "openai-compatible") return undefined;
  const missing = [];
  if (!configuration.hasBaseUrl) missing.push("base URL");
  if (!configuration.hasModel) missing.push("model");
  if (missing.length === 0) return undefined;
  return `OpenAI-compatible provider is missing ${missing.join(" and ")}.`;
}

function providerBudget(provider: PerceptionResourcePolicy["provider"]): AIProviderRuntimeBudget {
  return { ...provider };
}

function summarizeTasks(tasks: AIProviderTaskResolution[]): Record<AIProviderRuntimeState, number> {
  return tasks.reduce<Record<AIProviderRuntimeState, number>>(
    (summary, task) => {
      summary[task.state] += 1;
      return summary;
    },
    {
      ready: 0,
      disabled: 0,
      skipped_by_policy: 0,
      missing_configuration: 0,
      not_implemented: 0
    }
  );
}
