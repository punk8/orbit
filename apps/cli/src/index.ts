import { Command } from "commander";
import { fileURLToPath } from "node:url";
import { getDbPath } from "./commands/dbPath";
import {
  runKnowledgeEdit,
  runKnowledgeReviewAction,
  runMemoryEdit,
  runMemoryReviewAction,
  runRecommendationReviewAction
} from "./commands/governanceActions";
import { ingestCodex } from "./commands/ingestCodex";
import { ingestFixtures } from "./commands/ingestFixtures";
import { ingestLocalAgent } from "./commands/ingestLocalAgent";
import { ingestPerceptionFixtures } from "./commands/ingestPerceptionFixtures";
import {
  getActivitySession,
  getKnowledgeArtifact,
  getMemory,
  getProjectContext,
  getRecommendation,
  getTodayContext,
  listActivitySessions,
  listKnowledgeArtifacts,
  listMemories,
  listRecommendations,
  searchKnowledgeArtifacts,
  searchMemories
} from "./commands/readModels";
import {
  getProjectHandoff,
  getProjectHandoffMarkdown,
  getTodayHandoff,
  getTodayHandoffMarkdown
} from "./commands/handoff";
import {
  getObservePermissions,
  getObserveProtectedApps,
  getObserveStatus,
  ingestMockDesktopObservations
} from "./commands/observe";
import {
  cleanupPerceptionRawSidecars,
  captureScreenOcrOnce,
  getPerceptionReleaseGate,
  getPerceptionStatus,
  runScreenOcrSmoke,
  setPerceptionProviderRoute,
  setPerceptionSourcePolicy,
  summarizeVisionFixture,
  transcribeAudioFixture
} from "./commands/perception";
import { runSemanticPipeline } from "./commands/semanticPipeline";
import { getStatus } from "./commands/status";
import { getAIStatus, testAITask } from "./commands/ai";
import { buildAIProvider, isAIProviderConfigured, readAIProviderConfigFromEnv } from "@orbit/ai";
import { openOrbitDatabase } from "@orbit/db";
import { runSemanticPipelineWithProvider } from "@orbit/db";
import { getCliConfig } from "./config";
import { writeOutput } from "./output";

export function buildProgram(): Command {
  const program = new Command();
  program.name("orbit").description("Local-first work context continuity CLI").version("0.0.0");
  program.option("--json", "output JSON");

  program
    .command("status")
    .description("Show local Orbit status")
    .option("--json", "output JSON")
    .action((options: { json?: boolean }) => {
      writeOutput(getStatus(), { json: options.json ?? program.opts<{ json?: boolean }>().json });
    });

  const db = program.command("db").description("Database helpers");
  db.command("path")
    .description("Print the local database path")
    .option("--json", "output JSON")
    .action((options: { json?: boolean }) => {
      const path = getDbPath();
      const json = options.json ?? program.opts<{ json?: boolean }>().json;
      writeOutput(json ? { dbPath: path } : path, { json });
    });

  const ingest = program.command("ingest").description("Ingest source data");
  ingest
    .command("fixtures")
    .description("Ingest synthetic Codex and SeaTalk fixtures")
    .option("--json", "output JSON")
    .action(async (options: { json?: boolean }) => {
      const result = await ingestFixtures();
      writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
    });
  ingest
    .command("codex")
    .description("Ingest read-only Codex session files from an explicit path")
    .requiredOption("--path <path>", "Sanitized Codex session file or directory")
    .option("--json", "output JSON")
    .action(async (options: { path: string; json?: boolean }) => {
      const result = await ingestCodex(options.path);
      writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
    });
  ingest
    .command("local-agent")
    .description("Ingest generic local agent session files from an explicit path")
    .requiredOption("--path <path>", "Sanitized local agent session file or directory")
    .option("--json", "output JSON")
    .action(async (options: { path: string; json?: boolean }) => {
      const result = await ingestLocalAgent(options.path);
      writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
    });
  ingest
    .command("perception-fixtures")
    .description("Ingest explicit screen/OCR perception fixtures")
    .option("--vision", "also run mock vision summarization when perception policy allows it")
    .option("--audio", "also run mock meeting audio/transcript fixtures when policy allows it")
    .option("--json", "output JSON")
    .action(async (options: { vision?: boolean; audio?: boolean; json?: boolean }) => {
      const result = await ingestPerceptionFixtures({
        includeVision: options.vision ?? false,
        includeAudio: options.audio ?? false
      });
      writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
    });

  const pipeline = program.command("pipeline").description("Run local processing pipelines");
  pipeline
    .command("run")
    .description("Build Activity, Knowledge, Memory, and Recommendation records from stored Events")
    .option("--ai", "force configured AI provider for Knowledge drafting")
    .option("--json", "output JSON")
    .action(async (options: { ai?: boolean; json?: boolean }) => {
      const config = getCliConfig();
      const database = openOrbitDatabase({ orbitHome: config.orbitHome });
      try {
        const providerConfig = readAIProviderConfigFromEnv();
        const useProvider = Boolean(options.ai) || isAIProviderConfigured(providerConfig);
        const result = useProvider
          ? await runSemanticPipelineWithProvider(database, {
              aiProvider: buildAIProvider(providerConfig)
            })
          : runSemanticPipeline(database);
        writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
      } finally {
        database.close();
      }
    });

  const ai = program.command("ai").description("Inspect AI provider runtime routing");
  ai.command("status")
    .description("Show effective AI provider task routing without running model jobs")
    .option("--json", "output JSON")
    .action((options: { json?: boolean }) => {
      writeOutput(getAIStatus(), { json: options.json ?? program.opts<{ json?: boolean }>().json });
    });
  ai.command("test")
    .description("Run a synthetic provider test for one AI task")
    .requiredOption(
      "--task <task>",
      "knowledge_draft, vision_summary, ocr_postprocess, transcription, memory_candidate, recommendation, or context_compression"
    )
    .option("--json", "output JSON")
    .action(async (options: { task: string; json?: boolean }) => {
      const result = await testAITask(options.task);
      writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
    });

  const activity = program.command("activity").description("Read Activity Sessions");
  activity
    .command("list")
    .description("List Activity Sessions")
    .option("--json", "output JSON")
    .action((options: { json?: boolean }) => {
      writeOutput(listActivitySessions(), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });
  activity
    .command("show")
    .description("Show an Activity Session")
    .argument("<id>", "Activity Session ID")
    .option("--json", "output JSON")
    .action((id: string, options: { json?: boolean }) => {
      writeOutput(requireRecord(getActivitySession(id), "Activity Session", id), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });

  const knowledge = program.command("knowledge").description("Read Knowledge Artifacts");
  knowledge
    .command("list")
    .description("List Knowledge Artifacts")
    .option("--json", "output JSON")
    .action((options: { json?: boolean }) => {
      writeOutput(listKnowledgeArtifacts(), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });
  knowledge
    .command("show")
    .description("Show a Knowledge Artifact")
    .argument("<id>", "Knowledge Artifact ID")
    .option("--json", "output JSON")
    .action((id: string, options: { json?: boolean }) => {
      writeOutput(requireRecord(getKnowledgeArtifact(id), "Knowledge Artifact", id), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });
  knowledge
    .command("search")
    .description("Search Knowledge Artifacts")
    .argument("<query>", "FTS query")
    .option("--json", "output JSON")
    .action((query: string, options: { json?: boolean }) => {
      writeOutput(searchKnowledgeArtifacts(query), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });
  for (const action of ["confirm", "reject", "archive"] as const) {
    knowledge
      .command(action)
      .description(`${action} a Knowledge Artifact and write an audit log`)
      .argument("<id>", "Knowledge Artifact ID")
      .option("--json", "output JSON")
      .action((id: string, options: { json?: boolean }) => {
        writeOutput(runKnowledgeReviewAction(id, action), {
          json: options.json ?? program.opts<{ json?: boolean }>().json
        });
      });
  }
  knowledge
    .command("edit")
    .description("Edit a Knowledge Artifact")
    .argument("<id>", "Knowledge Artifact ID")
    .option("--title <title>", "Replacement title")
    .option("--description <description>", "Replacement description")
    .option("--markdown <markdown>", "Replacement markdown")
    .option("--key-insights <items>", "Pipe-separated replacement key insights")
    .option("--json", "output JSON")
    .action(
      (
        id: string,
        options: {
          title?: string;
          description?: string;
          markdown?: string;
          keyInsights?: string;
          json?: boolean;
        }
      ) => {
        const input = omitUndefined({
          title: options.title,
          description: options.description,
          markdown: options.markdown,
          keyInsights: parseListOption(options.keyInsights)
        });
        writeOutput(runKnowledgeEdit(id, input), {
          json: options.json ?? program.opts<{ json?: boolean }>().json
        });
      }
    );

  const memory = program.command("memory").description("Read Memories");
  memory
    .command("list")
    .description("List Memories")
    .option("--json", "output JSON")
    .action((options: { json?: boolean }) => {
      writeOutput(listMemories(), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });
  memory
    .command("show")
    .description("Show a Memory")
    .argument("<id>", "Memory ID")
    .option("--json", "output JSON")
    .action((id: string, options: { json?: boolean }) => {
      writeOutput(requireRecord(getMemory(id), "Memory", id), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });
  memory
    .command("search")
    .description("Search Memories")
    .argument("<query>", "FTS query")
    .option("--json", "output JSON")
    .action((query: string, options: { json?: boolean }) => {
      writeOutput(searchMemories(query), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });
  for (const action of ["confirm", "reject", "archive"] as const) {
    memory
      .command(action)
      .description(`${action} a Memory and write an audit log`)
      .argument("<id>", "Memory ID")
      .option("--json", "output JSON")
      .action((id: string, options: { json?: boolean }) => {
        writeOutput(runMemoryReviewAction(id, action), {
          json: options.json ?? program.opts<{ json?: boolean }>().json
        });
      });
  }
  memory
    .command("edit")
    .description("Edit a Memory")
    .argument("<id>", "Memory ID")
    .option("--title <title>", "Replacement title")
    .option("--body <body>", "Replacement body")
    .option("--tags <items>", "Pipe-separated replacement tags")
    .option("--json", "output JSON")
    .action(
      (id: string, options: { title?: string; body?: string; tags?: string; json?: boolean }) => {
        const input = omitUndefined({
          title: options.title,
          body: options.body,
          tags: parseListOption(options.tags)
        });
        writeOutput(runMemoryEdit(id, input), {
          json: options.json ?? program.opts<{ json?: boolean }>().json
        });
      }
    );

  const recommendation = program.command("recommendation").description("Read Recommendations");
  recommendation
    .command("list")
    .description("List Recommendations")
    .option("--json", "output JSON")
    .action((options: { json?: boolean }) => {
      writeOutput(listRecommendations(), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });
  recommendation
    .command("show")
    .description("Show a Recommendation")
    .argument("<id>", "Recommendation ID")
    .option("--json", "output JSON")
    .action((id: string, options: { json?: boolean }) => {
      writeOutput(requireRecord(getRecommendation(id), "Recommendation", id), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });
  for (const action of ["accept", "dismiss", "resolve"] as const) {
    recommendation
      .command(action)
      .description(`${action} a Recommendation and write an audit log`)
      .argument("<id>", "Recommendation ID")
      .option("--json", "output JSON")
      .action((id: string, options: { json?: boolean }) => {
        writeOutput(runRecommendationReviewAction(id, action), {
          json: options.json ?? program.opts<{ json?: boolean }>().json
        });
      });
  }
  recommendation
    .command("snooze")
    .description("Snooze a Recommendation without executing external side effects")
    .argument("<id>", "Recommendation ID")
    .option("--until <timestamp>", "ISO timestamp when the recommendation should reappear")
    .option("--json", "output JSON")
    .action((id: string, options: { until?: string; json?: boolean }) => {
      writeOutput(
        runRecommendationReviewAction(id, "snooze", omitUndefined({ snoozeUntil: options.until })),
        {
          json: options.json ?? program.opts<{ json?: boolean }>().json
        }
      );
    });

  const context = program.command("context").description("Read assembled context packs");
  context
    .command("today")
    .description("Show today's local context pack")
    .option("--date <date>", "YYYY-MM-DD date override")
    .option("--json", "output JSON")
    .action((options: { date?: string; json?: boolean }) => {
      writeOutput(getTodayContext(options.date), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });
  context
    .command("project")
    .description("Show a project context pack")
    .argument("<project>", "Project name")
    .option("--json", "output JSON")
    .action((project: string, options: { json?: boolean }) => {
      writeOutput(getProjectContext(project), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });

  const handoff = program.command("handoff").description("Generate agent handoff packs");
  handoff
    .command("today")
    .description("Generate today's agent handoff")
    .option("--date <date>", "YYYY-MM-DD date override")
    .option("--format <format>", "Output format: markdown")
    .option("--json", "output JSON")
    .action((options: { date?: string; format?: string; json?: boolean }) => {
      const json = options.json ?? program.opts<{ json?: boolean }>().json;
      const input = omitUndefined({ date: options.date });
      writeOutput(json ? getTodayHandoff(input) : getTodayHandoffMarkdown(input), { json });
    });
  handoff
    .command("project")
    .description("Generate a project agent handoff")
    .argument("<project>", "Project name")
    .option("--format <format>", "Output format: markdown")
    .option("--json", "output JSON")
    .action((project: string, options: { format?: string; json?: boolean }) => {
      const json = options.json ?? program.opts<{ json?: boolean }>().json;
      writeOutput(json ? getProjectHandoff(project) : getProjectHandoffMarkdown(project), { json });
    });

  const observe = program.command("observe").description("Inspect background observation state");
  observe
    .command("status")
    .description("Show local background observation status")
    .option("--json", "output JSON")
    .action((options: { json?: boolean }) => {
      writeOutput(getObserveStatus(), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });
  observe
    .command("permissions")
    .description("Show background observation permission gates")
    .option("--json", "output JSON")
    .action((options: { json?: boolean }) => {
      writeOutput(getObservePermissions(), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });
  observe
    .command("protected-apps")
    .description("Show protected app observation rules")
    .option("--json", "output JSON")
    .action((options: { json?: boolean }) => {
      writeOutput(getObserveProtectedApps(), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });
  observe
    .command("ingest-mock")
    .description("Ingest deterministic mock desktop observation fixtures")
    .option("--json", "output JSON")
    .action(async (options: { json?: boolean }) => {
      const result = await ingestMockDesktopObservations();
      writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
    });

  const perception = program
    .command("perception")
    .description("Inspect high-risk perception control-plane state");
  perception
    .command("status")
    .description("Show screen/OCR/vision/audio source policies without starting capture")
    .option("--json", "output JSON")
    .action((options: { json?: boolean }) => {
      writeOutput(getPerceptionStatus(), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });
  perception
    .command("screen-ocr-smoke")
    .description("Run a mock start/pause/resume/stop smoke for explicit screen/OCR observation")
    .option("--scope <scope>", "display, app, window, or region", "display")
    .option("--json", "output JSON")
    .action(async (options: { scope?: string; json?: boolean }) => {
      const result = await runScreenOcrSmoke(requireScreenScopeKind(options.scope));
      writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
    });
  perception
    .command("capture-screen-ocr")
    .description("Manually capture the current macOS display once and ingest local OCR summaries")
    .option("--helper <path>", "Swift helper path override")
    .option("--json", "output JSON")
    .action(async (options: { helper?: string; json?: boolean }) => {
      const result = await captureScreenOcrOnce(
        options.helper ? { helperPath: options.helper } : {}
      );
      writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
    });
  perception
    .command("source-policy")
    .description("Update a perception source policy")
    .argument("<source>", "screen, ocr, vision, microphone_audio, system_audio, or transcript")
    .option("--ai <value>", "true or false")
    .option("--export <value>", "true or false")
    .option("--raw <value>", "true or false")
    .option("--raw-ttl-minutes <minutes>", "raw sidecar TTL in minutes")
    .option("--json", "output JSON")
    .action(
      (
        source: string,
        options: {
          ai?: string;
          export?: string;
          raw?: string;
          rawTtlMinutes?: string;
          json?: boolean;
        }
      ) => {
        const result = setPerceptionSourcePolicy({
          sourceKind: source,
          patch: omitUndefined({
            canUseForAI: parseBooleanOption(options.ai),
            canExportToAgent: parseBooleanOption(options.export),
            canStoreRaw: parseBooleanOption(options.raw),
            rawRetentionTtlMinutes: parsePositiveIntegerOption(options.rawTtlMinutes)
          })
        });
        writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
      }
    );
  perception
    .command("provider-route")
    .description("Update a perception AI provider route")
    .argument("<task>", "ocr, vision, or transcription")
    .argument("<provider>", "disabled, mock, local, or openai-compatible")
    .option("--json", "output JSON")
    .action((task: string, provider: string, options: { json?: boolean }) => {
      const result = setPerceptionProviderRoute({ task, provider });
      writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
    });
  perception
    .command("vision-fixture")
    .description("Run explicit screen/OCR fixture vision summary through the configured route")
    .option("--json", "output JSON")
    .action(async (options: { json?: boolean }) => {
      const result = await summarizeVisionFixture();
      writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
    });
  perception
    .command("transcribe-fixture")
    .description("Run explicit audio fixture transcription through the configured provider route")
    .option("--json", "output JSON")
    .action(async (options: { json?: boolean }) => {
      const result = await transcribeAudioFixture();
      writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
    });
  perception
    .command("cleanup")
    .description("Remove expired or policy-blocked raw perception sidecars")
    .option("--dry-run", "report cleanup without modifying events or files")
    .option("--json", "output JSON")
    .action((options: { dryRun?: boolean; json?: boolean }) => {
      const result = cleanupPerceptionRawSidecars({ dryRun: options.dryRun === true });
      writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
    });
  perception
    .command("release-gate")
    .description("Evaluate Alpha perception release gates without starting capture")
    .option("--json", "output JSON")
    .action((options: { json?: boolean }) => {
      const result = getPerceptionReleaseGate();
      writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
    });

  return program;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await buildProgram().parseAsync(process.argv);
}

function requireRecord<T>(record: T | undefined, label: string, id: string): T {
  if (!record) {
    throw new Error(`${label} not found: ${id}`);
  }
  return record;
}

function requireScreenScopeKind(
  value: string | undefined
): "display" | "app" | "window" | "region" {
  if (value === "display" || value === "app" || value === "window" || value === "region") {
    return value;
  }
  throw new Error(`Unsupported screen/OCR scope: ${value ?? ""}`);
}

function parseBooleanOption(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Expected true or false, received: ${value}`);
}

function parsePositiveIntegerOption(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  throw new Error(`Expected a positive integer, received: ${value}`);
}

function parseListOption(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function omitUndefined<T extends Record<string, unknown>>(
  value: T
): {
  [K in keyof T]?: Exclude<T[K], undefined>;
} {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}
