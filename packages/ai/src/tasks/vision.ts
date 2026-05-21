import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import type { ID } from "@orbit/core";

export type VisionProviderKind = "disabled" | "mock" | "local" | "openai-compatible";

export const DEFAULT_OPENAI_COMPATIBLE_VISION_MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export interface VisionSummaryInput {
  language?: string;
  source: {
    eventId: ID;
    sourcePointer: string;
    timestamp: string;
    app?: string;
    windowTitle?: string;
  };
  screen: {
    summary: string;
    frameHash?: string;
    width?: number;
    height?: number;
  };
  image?: {
    localPath: string;
    mimeType?: string;
    filename?: string;
    sizeBytes?: number;
    width?: number;
    height?: number;
  };
  ocr?: {
    text?: string;
    textHash?: string;
    languages?: string[];
  };
  policy: {
    canUseForAI: boolean;
    allowExternal: boolean;
    exportEligible: boolean;
    redactionState: "none" | "redacted" | "failed";
  };
  budget: {
    maxInputChars: number;
    maxOutputTokens: number;
    maxImagePixels?: number;
    maxImageBytes?: number;
  };
}

export interface VisionSummaryOutput {
  title: string;
  summary: string;
  keyInsights: string[];
  decisions: string[];
  followUps: string[];
  confidence: number;
  provider: {
    id: string;
    kind: VisionProviderKind;
    model?: string;
  };
  redactionState: "none" | "redacted" | "failed";
  exportEligible: boolean;
  metadata: {
    promptVersion: string;
    budget: VisionSummaryInput["budget"];
    sourcePointer: string;
    frameHash?: string;
  };
}

export interface VisionProvider {
  id: string;
  kind: VisionProviderKind;
  enabled: boolean;
  name: string;
  model?: string;
  summarizeVision(input: VisionSummaryInput): Promise<VisionSummaryOutput>;
}

export interface OpenAICompatibleVisionProviderConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
  maxTokens?: number;
  maxImageBytes?: number;
}

export class VisionProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisionProviderError";
  }
}

export const disabledVisionProvider: VisionProvider = {
  id: "disabled_vision",
  kind: "disabled",
  enabled: false,
  name: "disabled",
  async summarizeVision(): Promise<VisionSummaryOutput> {
    throw new VisionProviderError("Vision provider is disabled.");
  }
};

export const mockVisionProvider: VisionProvider = {
  id: "mock_vision",
  kind: "mock",
  enabled: true,
  name: "mock_vision",
  model: "mock-vision-v1",
  async summarizeVision(input: VisionSummaryInput): Promise<VisionSummaryOutput> {
    assertVisionPolicyAllowsUse(input, false);
    const screen = truncate(input.screen.summary, 220);
    const ocr = truncate(input.ocr?.text, 220);
    const app = input.source.app ?? "screen";
    return {
      title: `Vision summary: ${app}`,
      summary: [screen, ocr ? `OCR: ${ocr}` : undefined].filter(Boolean).join(" "),
      keyInsights: [screen, ocr].filter((item): item is string => Boolean(item)).slice(0, 3),
      decisions: [],
      followUps: inferFollowUps(screen, ocr),
      confidence: 0.78,
      provider: {
        id: "mock_vision",
        kind: "mock",
        model: "mock-vision-v1"
      },
      redactionState: input.policy.redactionState,
      exportEligible: input.policy.exportEligible,
      metadata: visionMetadata(input)
    };
  }
};

export function createOpenAICompatibleVisionProvider(
  config: OpenAICompatibleVisionProviderConfig
): VisionProvider {
  const endpoint = normalizeChatCompletionsUrl(config.baseUrl);
  const timeoutMs = config.timeoutMs ?? 30_000;
  const maxTokens = readPositiveInteger(config.maxTokens, 700);
  const maxImageBytes = config.maxImageBytes ?? DEFAULT_OPENAI_COMPATIBLE_VISION_MAX_IMAGE_BYTES;

  return {
    id: "openai_compatible_vision",
    kind: "openai-compatible",
    enabled: true,
    name: "openai-compatible-vision",
    model: config.model,
    async summarizeVision(input: VisionSummaryInput): Promise<VisionSummaryOutput> {
      assertVisionPolicyAllowsUse(input, true);
      await assertVisionImageBudget(input, maxImageBytes);
      const payload = await buildVisionChatCompletionsPayload(input, config.model, maxTokens);
      const response = await postChatCompletion(endpoint, config.apiKey, payload, timeoutMs);
      return sanitizeVisionSummaryOutput(extractChatCompletionContent(response), input, {
        id: "openai_compatible_vision",
        kind: "openai-compatible",
        model: config.model
      });
    }
  };
}

export function sanitizeVisionSummaryOutput(
  raw: unknown,
  input: VisionSummaryInput,
  provider: VisionSummaryOutput["provider"]
): VisionSummaryOutput {
  const record = typeof raw === "string" ? parseJsonObject(raw) : raw;
  const object = isRecord(record) ? record : {};
  return {
    title: readText(object.title) ?? `Vision summary: ${input.source.app ?? "screen"}`,
    summary:
      readText(object.summary) ??
      truncate(input.screen.summary, Math.min(input.budget.maxInputChars, 300)),
    keyInsights: readStringArray(object.keyInsights).slice(0, 5),
    decisions: readStringArray(object.decisions).slice(0, 5),
    followUps: readStringArray(object.followUps).slice(0, 5),
    confidence: clampConfidence(object.confidence),
    provider,
    redactionState: input.policy.redactionState,
    exportEligible: input.policy.exportEligible,
    metadata: visionMetadata(input)
  };
}

function assertVisionPolicyAllowsUse(input: VisionSummaryInput, external: boolean): void {
  if (!input.policy.canUseForAI) {
    throw new VisionProviderError("Vision source policy does not allow AI use.");
  }
  if (input.policy.redactionState === "failed") {
    throw new VisionProviderError("Vision redaction failed; provider call is blocked.");
  }
  if (external && !input.policy.allowExternal) {
    throw new VisionProviderError("Vision source policy does not allow external provider use.");
  }
}

async function buildVisionChatCompletionsPayload(
  input: VisionSummaryInput,
  model: string,
  maxTokens: number
): Promise<Record<string, unknown>> {
  return {
    model,
    messages: [
      {
        role: "system",
        content: [
          "Summarize bounded Orbit visual work context.",
          "Return strict JSON with title, summary, keyInsights, decisions, followUps, confidence.",
          "Do not create a full screenshot transcript. Do not invent source details."
        ].join(" ")
      },
      {
        role: "user",
        content: await buildVisionUserContent(input)
      }
    ],
    temperature: 0,
    max_tokens: maxTokens
  };
}

async function buildVisionUserContent(
  input: VisionSummaryInput
): Promise<string | Array<Record<string, unknown>>> {
  const prompt = JSON.stringify(buildVisionPromptInput(input), null, 2);
  if (!input.image?.localPath) return prompt;
  return [
    {
      type: "text",
      text: prompt
    },
    {
      type: "image_url",
      image_url: {
        url: await readImageDataUrl(input.image)
      }
    }
  ];
}

function buildVisionPromptInput(input: VisionSummaryInput): Record<string, unknown> {
  return {
    language: input.language ?? "en",
    source: input.source,
    screen: {
      summary: truncate(input.screen.summary, input.budget.maxInputChars),
      frameHash: input.screen.frameHash,
      width: input.screen.width,
      height: input.screen.height
    },
    ocr: input.ocr
      ? {
          text: truncate(input.ocr.text, input.budget.maxInputChars),
          textHash: input.ocr.textHash,
          languages: input.ocr.languages
        }
      : undefined,
    image: input.image
      ? {
          filename: input.image.filename ?? basename(input.image.localPath),
          mimeType: input.image.mimeType ?? "application/octet-stream",
          sizeBytes: input.image.sizeBytes,
          width: input.image.width,
          height: input.image.height
        }
      : undefined,
    policy: {
      redactionState: input.policy.redactionState,
      exportEligible: input.policy.exportEligible
    },
    budget: input.budget
  };
}

async function assertVisionImageBudget(
  input: VisionSummaryInput,
  providerMaxImageBytes: number
): Promise<void> {
  if (!input.image?.localPath) return;
  if (input.policy.redactionState === "failed") {
    throw new VisionProviderError("Vision redaction failed; image provider call is blocked.");
  }
  const sizeBytes = input.image.sizeBytes ?? (await stat(input.image.localPath)).size;
  const maxImageBytes = input.budget.maxImageBytes ?? providerMaxImageBytes;
  if (sizeBytes > maxImageBytes) {
    throw new VisionProviderError(`Vision image exceeds size budget: ${sizeBytes} bytes`);
  }
  const width = input.image.width ?? input.screen.width;
  const height = input.image.height ?? input.screen.height;
  const pixels = width && height ? width * height : undefined;
  if (pixels && input.budget.maxImagePixels && pixels > input.budget.maxImagePixels) {
    throw new VisionProviderError(`Vision image exceeds pixel budget: ${pixels} pixels`);
  }
}

async function readImageDataUrl(image: NonNullable<VisionSummaryInput["image"]>): Promise<string> {
  const bytes = await readFile(image.localPath);
  const mimeType = image.mimeType ?? "application/octet-stream";
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function postChatCompletion(
  endpoint: string,
  apiKey: string | undefined,
  payload: Record<string, unknown>,
  timeoutMs: number
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (apiKey?.trim()) headers.Authorization = `Bearer ${apiKey}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const body = await response.text();
    if (!response.ok) {
      throw new VisionProviderError(
        `OpenAI-compatible vision provider returned HTTP ${response.status}: ${body.slice(0, 300)}`
      );
    }
    return JSON.parse(body);
  } catch (error) {
    if (error instanceof VisionProviderError) throw error;
    throw new VisionProviderError(`OpenAI-compatible vision request failed: ${String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

function extractChatCompletionContent(response: unknown): string {
  if (!isRecord(response) || !Array.isArray(response.choices) || !isRecord(response.choices[0])) {
    throw new VisionProviderError("OpenAI-compatible vision provider returned no choices.");
  }
  const message = response.choices[0].message;
  if (!isRecord(message) || typeof message.content !== "string") {
    throw new VisionProviderError("OpenAI-compatible vision provider returned empty content.");
  }
  return message.content;
}

function normalizeChatCompletionsUrl(baseUrl: string): string {
  const url = new URL(baseUrl.trim());
  let path = url.pathname || "";
  while (path.includes("//")) path = path.replaceAll("//", "/");
  while (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (!path || path === "/") path = "/v1/chat/completions";
  else if (path.endsWith("/v1")) path = `${path}/chat/completions`;
  else if (!path.endsWith("/v1/chat/completions")) path = `${path}/v1/chat/completions`;
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function parseJsonObject(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

function visionMetadata(input: VisionSummaryInput): VisionSummaryOutput["metadata"] {
  const metadata: VisionSummaryOutput["metadata"] = {
    promptVersion: "vision-work-context-v1",
    budget: input.budget,
    sourcePointer: input.source.sourcePointer
  };
  if (input.screen.frameHash) metadata.frameHash = input.screen.frameHash;
  return metadata;
}

function inferFollowUps(screen: string, ocr: string | undefined): string[] {
  const text = `${screen} ${ocr ?? ""}`.toLowerCase();
  if (text.includes("next") || text.includes("todo") || text.includes("follow")) {
    return ["Review the visible next step from the screen context."];
  }
  return [];
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function readText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readPositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function truncate(value: string | undefined, maxLength: number): string {
  if (!value) return "";
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
