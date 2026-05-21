import type { ActivitySession, Event, ID, PermissionScope } from "@orbit/core";
export * from "./tasks/vision";
export * from "./tasks/transcription";
export * from "./providerRegistry";

export type AIProviderKind = "disabled" | "mock" | "openai-compatible";
export type OpenAICompatibleTokenLimitParameter = "max_tokens" | "max_completion_tokens";

export const DEFAULT_OPENAI_COMPATIBLE_MAX_TOKENS = 1200;
export const DEFAULT_OPENAI_COMPATIBLE_TEST_MAX_TOKENS = 256;
export const DEFAULT_OPENAI_COMPATIBLE_TOKEN_LIMIT_PARAMETER: OpenAICompatibleTokenLimitParameter =
  "max_tokens";

export interface AiProviderStatus {
  enabled: boolean;
  name: string;
}

export interface EvidenceBackedText {
  text: string;
  evidenceIds: ID[];
}

export interface EvidenceBackedFollowUp {
  title: string;
  evidenceIds: ID[];
}

export interface DraftKnowledgeInput {
  session: ActivitySession;
  events: Event[];
  language?: string;
  sourcePermissions?: Record<string, PermissionScope | undefined>;
}

export interface DraftKnowledgeOutput {
  title: string;
  description: string;
  keyInsights: EvidenceBackedText[];
  decisions: EvidenceBackedText[];
  blockers: EvidenceBackedText[];
  followUps: EvidenceBackedFollowUp[];
  confidence: number;
}

export interface AIProvider extends AiProviderStatus {
  id: string;
  kind: AIProviderKind;
  draftKnowledge(input: DraftKnowledgeInput): Promise<DraftKnowledgeOutput>;
}

export interface AIProviderConfig {
  kind: AIProviderKind;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  maxTokens?: number;
  testMaxTokens?: number;
  tokenLimitParameter?: OpenAICompatibleTokenLimitParameter;
}

export interface AIProviderConnectionTestResult {
  ok: boolean;
  provider: AIProviderKind;
  message: string;
  latencyMs: number;
  endpoint?: string;
  model?: string;
}

export interface OpenAICompatibleProviderConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
  maxTokens?: number;
  testMaxTokens?: number;
  tokenLimitParameter?: OpenAICompatibleTokenLimitParameter;
}

export class AIProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIProviderError";
  }
}

export const disabledAiProvider: AIProvider = {
  id: "disabled",
  kind: "disabled",
  enabled: false,
  name: "disabled",
  async draftKnowledge(): Promise<DraftKnowledgeOutput> {
    throw new AIProviderError("AI provider is disabled.");
  }
};

export const mockAiProvider: AIProvider = {
  id: "mock_provider",
  kind: "mock",
  enabled: true,
  name: "mock_provider",
  async draftKnowledge(input: DraftKnowledgeInput): Promise<DraftKnowledgeOutput> {
    const evidenceIds = input.events.map((event) => event.id);
    const primaryEvidenceIds = evidenceIds.length > 0 ? [evidenceIds[0]!] : [input.session.id];
    const todoEvents = input.events.filter((event) => event.type === "todo");
    return {
      title: `Knowledge: ${input.session.title}`,
      description:
        input.session.summary ?? "Synthetic activity summary generated from source events.",
      keyInsights: buildMockInsights(input, primaryEvidenceIds),
      decisions: input.events
        .filter((event) => event.type === "decision")
        .map((event) => ({
          text: event.content.summary ?? event.content.title ?? "Decision captured",
          evidenceIds: [event.id]
        })),
      blockers: [],
      followUps: todoEvents.map((event) => ({
        title: event.content.title ?? event.content.text ?? "Follow up",
        evidenceIds: [event.id]
      })),
      confidence: 0.75
    };
  }
};

export function buildAIProvider(config: AIProviderConfig): AIProvider {
  if (config.kind === "disabled") return disabledAiProvider;
  if (config.kind === "mock") return mockAiProvider;
  if (!config.baseUrl?.trim()) {
    throw new AIProviderError("OpenAI-compatible provider requires a base URL.");
  }
  if (!config.model?.trim()) {
    throw new AIProviderError("OpenAI-compatible provider requires a model.");
  }
  const providerConfig: OpenAICompatibleProviderConfig = {
    baseUrl: config.baseUrl,
    model: config.model
  };
  if (config.apiKey !== undefined) providerConfig.apiKey = config.apiKey;
  if (config.timeoutMs !== undefined) providerConfig.timeoutMs = config.timeoutMs;
  if (config.maxTokens !== undefined) providerConfig.maxTokens = config.maxTokens;
  if (config.testMaxTokens !== undefined) providerConfig.testMaxTokens = config.testMaxTokens;
  if (config.tokenLimitParameter !== undefined) {
    providerConfig.tokenLimitParameter = config.tokenLimitParameter;
  }
  return createOpenAICompatibleProvider(providerConfig);
}

export function readAIProviderConfigFromEnv(
  env: Record<string, string | undefined> = process.env
): AIProviderConfig {
  const kind = readProviderKind(env.ORBIT_AI_PROVIDER);
  const config: AIProviderConfig = { kind };
  if (env.ORBIT_OPENAI_BASE_URL) config.baseUrl = env.ORBIT_OPENAI_BASE_URL;
  if (env.ORBIT_OPENAI_MODEL) config.model = env.ORBIT_OPENAI_MODEL;
  if (env.ORBIT_OPENAI_API_KEY) config.apiKey = env.ORBIT_OPENAI_API_KEY;
  if (env.ORBIT_OPENAI_TIMEOUT_MS) {
    const timeoutMs = Number(env.ORBIT_OPENAI_TIMEOUT_MS);
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) config.timeoutMs = timeoutMs;
  }
  if (env.ORBIT_OPENAI_MAX_TOKENS) {
    const maxTokens = Number(env.ORBIT_OPENAI_MAX_TOKENS);
    if (Number.isFinite(maxTokens) && maxTokens > 0) config.maxTokens = maxTokens;
  }
  if (env.ORBIT_OPENAI_TEST_MAX_TOKENS) {
    const testMaxTokens = Number(env.ORBIT_OPENAI_TEST_MAX_TOKENS);
    if (Number.isFinite(testMaxTokens) && testMaxTokens > 0) config.testMaxTokens = testMaxTokens;
  }
  if (env.ORBIT_OPENAI_TOKEN_LIMIT_PARAMETER) {
    config.tokenLimitParameter = readOpenAICompatibleTokenLimitParameter(
      env.ORBIT_OPENAI_TOKEN_LIMIT_PARAMETER
    );
  }
  return config;
}

export function isAIProviderConfigured(config: AIProviderConfig): boolean {
  return config.kind !== "disabled";
}

export async function testAIProviderConnection(
  config: AIProviderConfig
): Promise<AIProviderConnectionTestResult> {
  const startedAt = Date.now();
  if (config.kind === "disabled") {
    throw new AIProviderError("AI provider is disabled.");
  }
  if (config.kind === "mock") {
    return {
      ok: true,
      provider: "mock",
      message: "Mock provider is available.",
      latencyMs: Date.now() - startedAt
    };
  }
  if (!config.baseUrl?.trim()) {
    throw new AIProviderError("OpenAI-compatible provider requires a base URL.");
  }
  if (!config.model?.trim()) {
    throw new AIProviderError("OpenAI-compatible provider requires a model.");
  }

  const endpoint = normalizeChatCompletionsUrl(config.baseUrl);
  const payload = buildConnectionTestPayload(
    config.model.trim(),
    readPositiveInteger(config.testMaxTokens, DEFAULT_OPENAI_COMPATIBLE_TEST_MAX_TOKENS),
    readOpenAICompatibleTokenLimitParameter(config.tokenLimitParameter)
  );
  const response = await postChatCompletion(
    endpoint,
    config.apiKey,
    payload,
    config.timeoutMs ?? 15_000
  );
  const content = extractChatCompletionContent(response).trim();
  if (!content) {
    throw new AIProviderError("OpenAI-compatible provider returned an empty test response.");
  }
  return {
    ok: true,
    provider: "openai-compatible",
    message: `Connected to ${config.model.trim()}.`,
    latencyMs: Date.now() - startedAt,
    endpoint,
    model: config.model.trim()
  };
}

export function createOpenAICompatibleProvider(config: OpenAICompatibleProviderConfig): AIProvider {
  const endpoint = normalizeChatCompletionsUrl(config.baseUrl);
  const timeoutMs = config.timeoutMs ?? 30_000;
  const maxTokens = readPositiveInteger(config.maxTokens, DEFAULT_OPENAI_COMPATIBLE_MAX_TOKENS);
  const tokenLimitParameter = readOpenAICompatibleTokenLimitParameter(config.tokenLimitParameter);

  return {
    id: "openai_compatible_chat_completions",
    kind: "openai-compatible",
    enabled: true,
    name: "openai-compatible",
    async draftKnowledge(input: DraftKnowledgeInput): Promise<DraftKnowledgeOutput> {
      const payload = buildChatCompletionsPayload(
        input,
        config.model,
        maxTokens,
        tokenLimitParameter
      );
      const response = await postChatCompletion(endpoint, config.apiKey, payload, timeoutMs);
      const content = extractChatCompletionContent(response);
      return sanitizeDraftKnowledgeOutput(parseJsonObject(content), input);
    }
  };
}

export function normalizeChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    throw new AIProviderError("OpenAI-compatible provider requires a base URL.");
  }

  const url = new URL(trimmed);
  let path = normalizePath(url.pathname);
  const targetPath = "/v1/chat/completions";

  if (!path || path === "/") {
    path = targetPath;
  } else if (path.endsWith(targetPath)) {
    // keep full endpoint as-is
  } else if (path.endsWith("/v1")) {
    path = `${path}/chat/completions`;
  } else {
    path = `${path}${targetPath}`;
  }

  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function sanitizeDraftKnowledgeOutput(
  raw: unknown,
  input: DraftKnowledgeInput
): DraftKnowledgeOutput {
  const record = isRecord(raw) ? raw : {};
  return {
    title: readText(record.title) ?? `Knowledge: ${input.session.title}`,
    description:
      readText(record.description) ??
      input.session.summary ??
      "Synthetic activity summary generated from source events.",
    keyInsights: readEvidenceBackedTextArray(record.keyInsights, input),
    decisions: readEvidenceBackedTextArray(record.decisions, input),
    blockers: readEvidenceBackedTextArray(record.blockers, input),
    followUps: readEvidenceBackedFollowUpArray(record.followUps, input),
    confidence: clampConfidence(record.confidence)
  };
}

function buildMockInsights(
  input: DraftKnowledgeInput,
  fallbackEvidenceIds: ID[]
): EvidenceBackedText[] {
  const insights = input.events
    .map((event) => ({
      text: event.content.summary ?? event.content.title ?? event.content.text,
      evidenceIds: [event.id]
    }))
    .filter((item): item is EvidenceBackedText => Boolean(item.text))
    .slice(0, 5);
  return insights.length > 0
    ? insights
    : [
        {
          text: "No durable insight extracted from this session yet.",
          evidenceIds: fallbackEvidenceIds
        }
      ];
}

function readProviderKind(value: string | undefined): AIProviderKind {
  if (value === "mock" || value === "openai-compatible") return value;
  return "disabled";
}

export function readOpenAICompatibleTokenLimitParameter(
  value: string | undefined
): OpenAICompatibleTokenLimitParameter {
  if (value === "max_completion_tokens") return value;
  return DEFAULT_OPENAI_COMPATIBLE_TOKEN_LIMIT_PARAMETER;
}

function normalizePath(path: string): string {
  let normalized = path || "";
  while (normalized.includes("//")) {
    normalized = normalized.replaceAll("//", "/");
  }
  while (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function buildChatCompletionsPayload(
  input: DraftKnowledgeInput,
  model: string,
  maxTokens: number,
  tokenLimitParameter: OpenAICompatibleTokenLimitParameter
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "system",
        content: [
          "You draft reviewable Orbit Knowledge Artifacts from work activity evidence.",
          "Return strict JSON only. Do not invent evidence IDs or source pointers.",
          "Every key insight, decision, blocker, and follow-up must cite evidenceIds from the provided evidence list."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify(buildKnowledgePromptInput(input), null, 2)
      }
    ],
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "orbit_knowledge_draft",
        strict: true,
        schema: draftKnowledgeJsonSchema
      }
    }
  };
  payload[tokenLimitParameter] = maxTokens;
  return payload;
}

function buildConnectionTestPayload(
  model: string,
  maxTokens: number,
  tokenLimitParameter: OpenAICompatibleTokenLimitParameter
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "user",
        content: "Reply with a short confirmation that says orbit-ok."
      }
    ],
    temperature: 0
  };
  payload[tokenLimitParameter] = maxTokens;
  return payload;
}

function buildKnowledgePromptInput(input: DraftKnowledgeInput): Record<string, unknown> {
  return {
    language: input.language ?? "en",
    session: {
      id: input.session.id,
      title: input.session.title,
      startAt: input.session.startAt,
      endAt: input.session.endAt,
      project: input.session.project,
      apps: input.session.apps,
      summary: input.session.summary
    },
    evidence: input.events
      .filter((event) => canSendEventToAI(event, input))
      .map((event) => ({
        id: event.id,
        type: event.type,
        occurredAt: event.occurredAt,
        sourceKind: event.source.kind,
        app: event.context.app,
        project: event.context.project,
        title: event.content.title,
        summary: event.content.summary,
        textExcerpt: truncate(event.content.text, 700)
      }))
  };
}

function canSendEventToAI(event: Event, input: DraftKnowledgeInput): boolean {
  if (event.privacy.sensitivity === "secret") return false;
  if (event.privacy.redactionState === "failed") return false;

  const permissionScope = input.sourcePermissions?.[event.source.adapterId];
  if (permissionScope) {
    if (permissionScope.sourceKind !== event.source.kind) return false;
    if (!permissionScope.canUseForAI) return false;
  }

  if (event.privacy.sensitivity === "confidential") {
    return permissionScope?.canUseForAI === true;
  }

  return true;
}

async function postChatCompletion(
  endpoint: string,
  apiKey: string | undefined,
  payload: Record<string, unknown>,
  timeoutMs: number
): Promise<unknown> {
  const first = await sendChatCompletion(endpoint, apiKey, payload, timeoutMs);
  if ((first.status === 400 || first.status === 422) && "response_format" in payload) {
    const retryPayload = { ...payload };
    delete retryPayload.response_format;
    const retry = await sendChatCompletion(endpoint, apiKey, retryPayload, timeoutMs);
    return parseProviderResponse(retry);
  }
  return parseProviderResponse(first);
}

async function sendChatCompletion(
  endpoint: string,
  apiKey: string | undefined,
  payload: Record<string, unknown>,
  timeoutMs: number
): Promise<{ status: number; ok: boolean; body: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (apiKey?.trim()) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    return {
      status: response.status,
      ok: response.ok,
      body: await response.text()
    };
  } catch (error) {
    throw new AIProviderError(`OpenAI-compatible request failed: ${formatUnknownError(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

function parseProviderResponse(response: { status: number; ok: boolean; body: string }): unknown {
  if (!response.ok) {
    throw new AIProviderError(
      `OpenAI-compatible provider returned HTTP ${response.status}: ${readProviderErrorDetail(
        response.body
      )}`
    );
  }
  try {
    return JSON.parse(response.body);
  } catch (error) {
    throw new AIProviderError(
      `OpenAI-compatible provider returned invalid JSON: ${formatUnknownError(error)}`
    );
  }
}

function extractChatCompletionContent(response: unknown): string {
  if (!isRecord(response)) {
    throw new AIProviderError("OpenAI-compatible provider returned a malformed response.");
  }
  const choices = response.choices;
  if (!Array.isArray(choices) || choices.length === 0 || !isRecord(choices[0])) {
    throw new AIProviderError("OpenAI-compatible provider returned no choices.");
  }
  const message = choices[0].message;
  if (!isRecord(message)) {
    throw new AIProviderError("OpenAI-compatible provider returned a malformed message.");
  }
  return coerceMessageContent(message.content);
}

function readProviderErrorDetail(body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (isRecord(parsed)) {
      const providerError = parsed.error;
      if (isRecord(providerError) && typeof providerError.message === "string") {
        return providerError.message;
      }
      if (typeof parsed.message === "string") {
        return parsed.message;
      }
    }
  } catch {
    // Provider errors are often plain text; fall through to a bounded excerpt.
  }
  return body.slice(0, 300);
}

function coerceMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (isRecord(part) && typeof part.text === "string") return part.text;
        return "";
      })
      .join("");
  }
  throw new AIProviderError("OpenAI-compatible provider returned empty message content.");
}

function parseJsonObject(text: string): unknown {
  const trimmed = stripMarkdownFence(text.trim());
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new AIProviderError(
      `OpenAI-compatible provider returned non-JSON content: ${formatUnknownError(error)}`
    );
  }
}

function stripMarkdownFence(text: string): string {
  if (!text.startsWith("```")) return text;
  const withoutOpening = text.replace(/^```(?:json)?\s*/i, "");
  return withoutOpening.replace(/\s*```$/, "");
}

function readEvidenceBackedTextArray(
  value: unknown,
  input: DraftKnowledgeInput
): EvidenceBackedText[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readEvidenceBackedText(item, input))
    .filter((item): item is EvidenceBackedText => item !== undefined);
}

function readEvidenceBackedFollowUpArray(
  value: unknown,
  input: DraftKnowledgeInput
): EvidenceBackedFollowUp[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readEvidenceBackedFollowUp(item, input))
    .filter((item): item is EvidenceBackedFollowUp => item !== undefined);
}

function readEvidenceBackedText(
  value: unknown,
  input: DraftKnowledgeInput
): EvidenceBackedText | undefined {
  if (!isRecord(value)) return undefined;
  const text = readText(value.text);
  const evidenceIds = readValidEvidenceIds(value.evidenceIds, input);
  if (!text || evidenceIds.length === 0) return undefined;
  return { text, evidenceIds };
}

function readEvidenceBackedFollowUp(
  value: unknown,
  input: DraftKnowledgeInput
): EvidenceBackedFollowUp | undefined {
  if (!isRecord(value)) return undefined;
  const title = readText(value.title);
  const evidenceIds = readValidEvidenceIds(value.evidenceIds, input);
  if (!title || evidenceIds.length === 0) return undefined;
  return { title, evidenceIds };
}

function readValidEvidenceIds(value: unknown, input: DraftKnowledgeInput): ID[] {
  if (!Array.isArray(value)) return [];
  const validIds = new Set<ID>([input.session.id, ...input.events.map((event) => event.id)]);
  return dedupe(value.filter((item): item is ID => typeof item === "string" && validIds.has(item)));
}

function readText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function readPositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return fallback;
  return value;
}

function truncate(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const draftKnowledgeJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "description",
    "keyInsights",
    "decisions",
    "blockers",
    "followUps",
    "confidence"
  ],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    keyInsights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "evidenceIds"],
        properties: {
          text: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } }
        }
      }
    },
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "evidenceIds"],
        properties: {
          text: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } }
        }
      }
    },
    blockers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "evidenceIds"],
        properties: {
          text: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } }
        }
      }
    },
    followUps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "evidenceIds"],
        properties: {
          title: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } }
        }
      }
    },
    confidence: { type: "number", minimum: 0, maximum: 1 }
  }
} as const;
