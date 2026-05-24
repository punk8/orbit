import { Command } from "commander";
import { fileURLToPath } from "node:url";
import { listAgentResources, readAgentResource } from "./commands/agent";
import { getDbPath } from "./commands/dbPath";
import { getDogfoodReadiness } from "./commands/dogfood";
import {
  runKnowledgeEdit,
  runKnowledgeReviewAction,
  runActivityDelete,
  runMemoryDelete,
  runMemoryEdit,
  runMemoryRollback,
  runMemoryReviewAction,
  runRecommendationReviewAction
} from "./commands/governanceActions";
import { ingestCodex } from "./commands/ingestCodex";
import { ingestLocalAgent } from "./commands/ingestLocalAgent";
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
import { getActivityFrames, getActivityPlayback } from "./commands/activityPlayback";
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
  upsertObserveProtectedRule
} from "./commands/observe";
import {
  cleanupPerceptionRawSidecars,
  captureScreenOcrBurstNow,
  captureScreenOcrOnce,
  deletePerceptionEvents,
  disablePerceptionSourceAndDeleteRaw,
  getPerceptionReleaseGate,
  getPerceptionStatus,
  ignoreCurrentPerceptionContext,
  setPerceptionProtectedRule,
  setPerceptionSamplingPreset,
  setPerceptionProviderRoute,
  setPerceptionSourcePolicy,
  syncPerceptionDogfoodPermission,
} from "./commands/perception";
import {
  runPipelineWithProviderAndQuality,
  runPipelineWithQuality
} from "./commands/pipelineQuality";
import { getStatus } from "./commands/status";
import { getAIStatus, testAITask } from "./commands/ai";
import { buildAIProvider, isAIProviderConfigured, readAIProviderConfigFromEnv } from "@orbit/ai";
import { getLocalDateKey } from "@orbit/core";
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

  const agent = program.command("agent").description("Read-only Agent Interface resources");
  agent
    .command("resources")
    .description("List read-only Orbit resources available to local agents")
    .option("--json", "output JSON")
    .action((options: { json?: boolean }) => {
      writeOutput(listAgentResources(), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });
  agent
    .command("read")
    .description("Read a read-only Orbit agent resource")
    .argument("<uri>", "Resource URI, for example orbit://handoff/today")
    .option("--date <date>", "YYYY-MM-DD date override for today handoff")
    .option("--json", "output JSON")
    .action((uri: string, options: { date?: string; json?: boolean }) => {
      const resource = readAgentResource(
        uri,
        options.date === undefined ? {} : { date: options.date }
      );
      const json = options.json ?? program.opts<{ json?: boolean }>().json;
      writeOutput(json ? resource : resource.content, { json });
    });

  const ingest = program.command("ingest").description("Ingest source data");
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

  const pipeline = program.command("pipeline").description("Run local processing pipelines");
  pipeline
    .command("run")
    .description("Build Activity, Knowledge, Memory, and Recommendation records from stored Events")
    .option("--ai", "force configured AI provider for Knowledge drafting")
    .option("--language <language>", "Knowledge draft language: en or zh-CN")
    .option("--json", "output JSON")
    .action(async (options: { ai?: boolean; language?: string; json?: boolean }) => {
      const providerConfig = readAIProviderConfigFromEnv();
      const useProvider = Boolean(options.ai) || isAIProviderConfigured(providerConfig);
      const language = readKnowledgeLanguage(options.language);
      const result = useProvider
        ? await runPipelineWithProviderAndQuality({
            aiProvider: buildAIProvider(providerConfig),
            ...(language ? { language } : {})
          })
        : runPipelineWithQuality(language ? { language } : {});
      writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
    });
  pipeline
    .command("quality")
    .description("Run the evidence-backed quality gate for the local semantic pipeline")
    .option("--ai", "force configured AI provider for Knowledge drafting")
    .option("--language <language>", "Knowledge draft language: en or zh-CN")
    .option("--json", "output JSON")
    .action(async (options: { ai?: boolean; language?: string; json?: boolean }) => {
      const providerConfig = readAIProviderConfigFromEnv();
      const useProvider = Boolean(options.ai) || isAIProviderConfigured(providerConfig);
      const language = readKnowledgeLanguage(options.language);
      const result = useProvider
        ? await runPipelineWithProviderAndQuality({
            aiProvider: buildAIProvider(providerConfig),
            ...(language ? { language } : {})
          })
        : runPipelineWithQuality(language ? { language } : {});
      writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
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
    .command("frames")
    .description("List playback frame metadata for an Activity Session")
    .argument("<id>", "Activity Session ID")
    .option("--json", "output JSON")
    .action((id: string, options: { json?: boolean }) => {
      writeOutput(getActivityFrames(id), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });
  activity
    .command("playback")
    .description("Show playback scrubber and event stream for an Activity Session")
    .argument("<id>", "Activity Session ID")
    .option("--json", "output JSON")
    .action((id: string, options: { json?: boolean }) => {
      writeOutput(getActivityPlayback(id), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });
  activity
    .command("delete")
    .description("Delete an Activity Session and write an audit log")
    .argument("<id>", "Activity Session ID")
    .option("--json", "output JSON")
    .action((id: string, options: { json?: boolean }) => {
      writeOutput(runActivityDelete(id), {
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
  memory
    .command("delete")
    .description("Delete a Memory and write an audit log")
    .argument("<id>", "Memory ID")
    .option("--json", "output JSON")
    .action((id: string, options: { json?: boolean }) => {
      writeOutput(runMemoryDelete(id), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });
  memory
    .command("rollback")
    .description("Rollback a Memory to its previous version and write an audit log")
    .argument("<id>", "Memory ID")
    .option("--json", "output JSON")
    .action((id: string, options: { json?: boolean }) => {
      writeOutput(runMemoryRollback(id), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });

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
  context
    .command("dogfood")
    .description("Show whether today's Activity, Knowledge, Memory, and Handoff loop is agent-ready")
    .option("--date <date>", "YYYY-MM-DD date override")
    .option("--json", "output JSON")
    .action((options: { date?: string; json?: boolean }) => {
      writeOutput(getDogfoodReadiness({ date: options.date ?? getLocalDateOptionDefault() }), {
        json: options.json ?? program.opts<{ json?: boolean }>().json
      });
    });

  const handoff = program.command("handoff").description("Generate agent handoff packs");
  handoff
    .command("today")
    .description("Generate today's agent handoff")
    .option("--date <date>", "YYYY-MM-DD date override")
    .option("--format <format>", "Output format: markdown")
    .option("--language <language>", "Markdown language: en or zh-CN")
    .option("--json", "output JSON")
    .action((options: { date?: string; format?: string; language?: string; json?: boolean }) => {
      const json = options.json ?? program.opts<{ json?: boolean }>().json;
      const input = omitUndefined({ date: options.date });
      writeOutput(
        json
          ? getTodayHandoff(input)
          : getTodayHandoffMarkdown(withHandoffLanguage(input, options.language)),
        { json }
      );
    });
  handoff
    .command("project")
    .description("Generate a project agent handoff")
    .argument("<project>", "Project name")
    .option("--format <format>", "Output format: markdown")
    .option("--language <language>", "Markdown language: en or zh-CN")
    .option("--json", "output JSON")
    .action((project: string, options: { format?: string; language?: string; json?: boolean }) => {
      const json = options.json ?? program.opts<{ json?: boolean }>().json;
      writeOutput(
        json
          ? getProjectHandoff(project)
          : getProjectHandoffMarkdown(project, withHandoffLanguage({}, options.language)),
        { json }
      );
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
    .command("protect")
    .description("Add or update a protected observation rule")
    .requiredOption(
      "--kind <kind>",
      "bundle_id, app_name, window_title_pattern, domain_pattern, url_pattern, or text_pattern"
    )
    .requiredOption("--value <value>", "Protected rule value or pattern")
    .option("--reason <reason>", "Protected rule reason", "user_added")
    .option("--json", "output JSON")
    .action((options: { kind: string; value: string; reason?: string; json?: boolean }) => {
      const result = upsertObserveProtectedRule({
        kind: requireProtectedRuleKind(options.kind),
        value: options.value,
        reason: requireProtectedRuleReason(options.reason)
      });
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
    .command("protected-rule")
    .description("Add or update a protected Screen/OCR rule")
    .requiredOption(
      "--kind <kind>",
      "bundle_id, app_name, window_title_pattern, domain_pattern, url_pattern, or text_pattern"
    )
    .requiredOption("--value <value>", "Protected rule value or pattern")
    .option("--reason <reason>", "Protected rule reason", "user_added")
    .option("--json", "output JSON")
    .action((options: { kind: string; value: string; reason?: string; json?: boolean }) => {
      const result = setPerceptionProtectedRule({
        kind: requireProtectedRuleKind(options.kind),
        value: options.value,
        reason: requireProtectedRuleReason(options.reason)
      });
      writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
    });
  perception
    .command("ignore-current")
    .description("Add protected rules for current app/window metadata supplied by the caller")
    .option("--app-name <name>", "Current foreground app name")
    .option("--bundle-id <bundleId>", "Current foreground app bundle identifier")
    .option("--window-title <title>", "Current foreground window title")
    .option("--json", "output JSON")
    .action(
      (options: {
        appName?: string;
        bundleId?: string;
        windowTitle?: string;
        json?: boolean;
      }) => {
        const result = ignoreCurrentPerceptionContext(
          omitUndefined({
            appName: options.appName,
            bundleId: options.bundleId,
            windowTitle: options.windowTitle
          })
        );
        writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
      }
    );
  perception
    .command("dogfood-permission")
    .description("Sync macOS Screen Recording permission without starting Screen/OCR capture")
    .requiredOption(
      "--status <status>",
      "not_determined, granted, denied, restricted, unknown, or not_required"
    )
    .option("--json", "output JSON")
    .action((options: { status: string; json?: boolean }) => {
      const result = syncPerceptionDogfoodPermission({ permission: options.status });
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
  const perceptionScreen = perception
    .command("screen")
    .description("Screen/OCR source controls that do not start capture unless explicit");
  perceptionScreen
    .command("capture-now")
    .description("Run one explicit eligible Screen/OCR burst")
    .option("--mock", "use the mock native helper instead of real capture")
    .option("--json", "output JSON")
    .action(async (options: { mock?: boolean; json?: boolean }) => {
      const result = await captureScreenOcrBurstNow({ mock: options.mock === true });
      writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
    });
  perceptionScreen
    .command("cleanup")
    .description("Remove expired or policy-blocked raw screen sidecars")
    .option("--dry-run", "report cleanup without modifying events or files")
    .option("--confirm", "confirm cleanup may modify local Event metadata and sidecar files")
    .option("--json", "output JSON")
    .action((options: { dryRun?: boolean; confirm?: boolean; json?: boolean }) => {
      const result = cleanupPerceptionRawSidecars({
        dryRun: options.dryRun === true,
        confirm: options.confirm === true
      });
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
    .command("sampling-preset")
    .description("Set the screen/OCR sampling preset without starting capture")
    .argument("<preset>", "conservative, balanced, or intensive")
    .option("--json", "output JSON")
    .action((preset: string, options: { json?: boolean }) => {
      const result = setPerceptionSamplingPreset({ preset });
      writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
    });
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
    .command("cleanup")
    .description("Remove expired or policy-blocked raw perception sidecars")
    .option("--dry-run", "report cleanup without modifying events or files")
    .option("--confirm", "confirm cleanup may modify local Event metadata and sidecar files")
    .option("--json", "output JSON")
    .action((options: { dryRun?: boolean; confirm?: boolean; json?: boolean }) => {
      const result = cleanupPerceptionRawSidecars({
        dryRun: options.dryRun === true,
        confirm: options.confirm === true
      });
      writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
    });
  perception
    .command("delete-events")
    .description("Delete source-derived perception Events by source and optional time range")
    .option("--source-kind <source>", "screen, ocr, vision, microphone_audio, system_audio, or transcript")
    .option("--source-adapter-id <id>", "specific adapter ID to delete")
    .option("--from <timestamp>", "inclusive ISO timestamp lower bound")
    .option("--to <timestamp>", "inclusive ISO timestamp upper bound")
    .option("--dry-run", "preview matched Events without deleting data")
    .option("--confirm", "confirm destructive Event deletion")
    .option("--json", "output JSON")
    .action(
      (options: {
        sourceKind?: string;
        sourceAdapterId?: string;
        from?: string;
        to?: string;
        dryRun?: boolean;
        confirm?: boolean;
        json?: boolean;
      }) => {
        const input: Parameters<typeof deletePerceptionEvents>[0] = {
          dryRun: options.dryRun === true,
          confirm: options.confirm === true
        };
        if (options.sourceKind !== undefined) input.sourceKind = options.sourceKind;
        if (options.sourceAdapterId !== undefined) input.sourceAdapterId = options.sourceAdapterId;
        if (options.from !== undefined) input.from = options.from;
        if (options.to !== undefined) input.to = options.to;
        const result = deletePerceptionEvents(input);
        writeOutput(result, { json: options.json ?? program.opts<{ json?: boolean }>().json });
      }
    );
  perception
    .command("disable-source-delete-raw")
    .description("Disable one perception source and delete its registered raw sidecars")
    .requiredOption(
      "--source-kind <source>",
      "screen, ocr, vision, microphone_audio, system_audio, or transcript"
    )
    .option("--confirm", "confirm disabling the source and cleaning raw sidecars")
    .option("--json", "output JSON")
    .action((options: { sourceKind: string; confirm?: boolean; json?: boolean }) => {
      const result = disablePerceptionSourceAndDeleteRaw({
        sourceKind: options.sourceKind,
        confirm: options.confirm === true
      });
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
  perception
    .command("audit-review")
    .description("Summarize perception hardening audit coverage")
    .option("--json", "output JSON")
    .action((options: { json?: boolean }) => {
      const result = getPerceptionReleaseGate();
      writeOutput(
        {
          orbitHome: result.orbitHome,
          dbPath: result.dbPath,
          auditReview: result.releaseGate.auditReview
        },
        { json: options.json ?? program.opts<{ json?: boolean }>().json }
      );
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

function requireProtectedRuleKind(
  value: string
):
  | "bundle_id"
  | "app_name"
  | "window_title_pattern"
  | "domain_pattern"
  | "url_pattern"
  | "text_pattern" {
  if (
    value === "bundle_id" ||
    value === "app_name" ||
    value === "window_title_pattern" ||
    value === "domain_pattern" ||
    value === "url_pattern" ||
    value === "text_pattern"
  ) {
    return value;
  }
  throw new Error(`Unsupported protected rule kind: ${value}`);
}

function requireProtectedRuleReason(
  value: string | undefined
):
  | "default_sensitive_app"
  | "user_added"
  | "private_window"
  | "password_field"
  | "financial_or_payment"
  | "authentication_or_otp"
  | "secret_like_content" {
  if (
    value === undefined ||
    value === "user_added" ||
    value === "default_sensitive_app" ||
    value === "private_window" ||
    value === "password_field" ||
    value === "financial_or_payment" ||
    value === "authentication_or_otp" ||
    value === "secret_like_content"
  ) {
    return value ?? "user_added";
  }
  throw new Error(`Unsupported protected rule reason: ${value}`);
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

function getLocalDateOptionDefault(): string {
  return getLocalDateKey();
}

function readHandoffLanguage(value: string | undefined): "en" | "zh-CN" | undefined {
  if (value === undefined) return undefined;
  if (value === "en" || value === "zh-CN") return value;
  throw new Error(`Unsupported handoff language: ${value}`);
}

function readKnowledgeLanguage(value: string | undefined): "en" | "zh-CN" | undefined {
  if (value === undefined) return undefined;
  if (value === "en" || value === "zh-CN") return value;
  throw new Error(`Unsupported knowledge language: ${value}`);
}

function withHandoffLanguage<T extends Record<string, unknown>>(
  input: T,
  value: string | undefined
): T & { language?: "en" | "zh-CN" } {
  const language = readHandoffLanguage(value);
  return language ? { ...input, language } : input;
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
