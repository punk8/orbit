import {
  buildAIProviderRuntimeRegistry,
  readAIProviderConfigFromEnv,
  requireAIProviderRuntimeTask,
  testAIProviderConnection,
  type AIProviderRuntimeRegistry,
  type AIProviderRuntimeTask
} from "@orbit/ai";
import { AuditRepository, openOrbitDatabase, readPerceptionStatus } from "@orbit/db";
import { getCliConfig } from "../config";

type AuditDatabase = ConstructorParameters<typeof AuditRepository>[0];

export interface AIStatusResult {
  orbitHome: string;
  dbPath: string;
  providerRegistry: AIProviderRuntimeRegistry;
}

export interface AITaskTestResult {
  orbitHome: string;
  dbPath: string;
  task: AIProviderRuntimeTask;
  ok: boolean;
  provider: string;
  state: string;
  message: string;
  latencyMs: number;
  endpoint?: string;
  model?: string;
  providerRegistry: AIProviderRuntimeRegistry;
}

export function getAIStatus(): AIStatusResult {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    const providerRegistry = buildAIProviderRuntimeRegistry({
      aiProviderConfig: readAIProviderConfigFromEnv(),
      perceptionStatus: readPerceptionStatus(database.db)
    });
    auditProviderRegistryResolution(database.db, providerRegistry);
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      providerRegistry
    };
  } finally {
    database.close();
  }
}

export async function testAITask(taskValue: string): Promise<AITaskTestResult> {
  const task = requireAIProviderRuntimeTask(taskValue);
  const startedAt = Date.now();
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    const aiProviderConfig = readAIProviderConfigFromEnv();
    const providerRegistry = buildAIProviderRuntimeRegistry({
      aiProviderConfig,
      perceptionStatus: readPerceptionStatus(database.db)
    });
    const resolution = providerRegistry.tasks.find((item) => item.task === task);
    if (!resolution) {
      throw new Error(`AI provider task was not resolved: ${task}`);
    }
    auditProviderRegistryResolution(database.db, providerRegistry);

    if (task !== "knowledge_draft") {
      const result: AITaskTestResult = {
        orbitHome: database.orbitHome,
        dbPath: database.dbPath,
        task,
        ok: false,
        provider: resolution.providerKind,
        state: resolution.state,
        message: "Synthetic connection test is currently implemented for knowledge_draft only.",
        latencyMs: Date.now() - startedAt,
        providerRegistry
      };
      auditTaskTest(database.db, result);
      return result;
    }

    if (resolution.state !== "ready") {
      const result: AITaskTestResult = {
        orbitHome: database.orbitHome,
        dbPath: database.dbPath,
        task,
        ok: false,
        provider: resolution.providerKind,
        state: resolution.state,
        message: resolution.reason,
        latencyMs: Date.now() - startedAt,
        providerRegistry
      };
      auditTaskTest(database.db, result);
      return result;
    }

    const connection = await testAIProviderConnection(aiProviderConfig);
    const result: AITaskTestResult = {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      task,
      ok: connection.ok,
      provider: connection.provider,
      state: resolution.state,
      message: connection.message,
      latencyMs: connection.latencyMs,
      ...(connection.endpoint ? { endpoint: connection.endpoint } : {}),
      ...(connection.model ? { model: connection.model } : {}),
      providerRegistry
    };
    auditTaskTest(database.db, result);
    return result;
  } catch (error) {
    const providerRegistry = buildAIProviderRuntimeRegistry({
      aiProviderConfig: readAIProviderConfigFromEnv(),
      perceptionStatus: readPerceptionStatus(database.db)
    });
    const resolution = providerRegistry.tasks.find((item) => item.task === task);
    const result: AITaskTestResult = {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      task,
      ok: false,
      provider: resolution?.providerKind ?? "disabled",
      state: resolution?.state ?? "missing_configuration",
      message: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
      providerRegistry
    };
    auditTaskTest(database.db, result);
    return result;
  } finally {
    database.close();
  }
}

function auditProviderRegistryResolution(
  db: AuditDatabase,
  providerRegistry: AIProviderRuntimeRegistry
): void {
  new AuditRepository(db).log("ai.provider_registry.resolve", "ai_provider_registry", undefined, {
    summary: providerRegistry.summary,
    tasks: providerRegistry.tasks.map((task) => ({
      task: task.task,
      providerKind: task.providerKind,
      state: task.state,
      enabled: task.enabled,
      external: task.external,
      implemented: task.implemented,
      sourceKinds: task.sourceKinds,
      blockedByPolicySourceKinds: task.blockedByPolicySourceKinds,
      reason: task.reason
    }))
  });
}

function auditTaskTest(db: AuditDatabase, result: AITaskTestResult): void {
  new AuditRepository(db).log("ai.provider_task.test", "ai_provider_task", result.task, {
    ok: result.ok,
    provider: result.provider,
    state: result.state,
    message: result.message,
    latencyMs: result.latencyMs,
    endpoint: result.endpoint,
    model: result.model
  });
}
