import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";

export type TranscriptionProviderKind = "disabled" | "mock" | "local" | "openai-compatible";

export const DEFAULT_OPENAI_COMPATIBLE_TRANSCRIPTION_MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const DEFAULT_OPENAI_COMPATIBLE_TRANSCRIPTION_MAX_DURATION_MS = 10 * 60 * 1000;

export interface TranscriptionInput {
  segmentId: string;
  segmentHash: string;
  startedAt: string;
  durationMs: number;
  app?: string;
  scopeLabel?: string;
  audio?: {
    localPath: string;
    mimeType?: string;
    filename?: string;
    sizeBytes?: number;
  };
  redactedAudioSummary?: string;
  fixtureTranscript?: string;
  policy: {
    canUseForAI: boolean;
    allowExternal: boolean;
    redactionState: "none" | "redacted" | "failed";
  };
}

export interface TranscriptionOutput {
  text: string;
  language?: string;
  confidence: number;
  provider: {
    id: string;
    kind: TranscriptionProviderKind;
    model?: string;
  };
  redactionState: "none" | "redacted" | "failed";
}

export interface TranscriptionProvider {
  id: string;
  kind: TranscriptionProviderKind;
  enabled: boolean;
  name: string;
  model?: string;
  transcribe(input: TranscriptionInput): Promise<TranscriptionOutput>;
}

export interface TranscriptionProviderConfig {
  kind: TranscriptionProviderKind;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  maxAudioBytes?: number;
  maxDurationMs?: number;
}

export interface OpenAICompatibleTranscriptionProviderConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
  maxAudioBytes?: number;
  maxDurationMs?: number;
}

export class TranscriptionProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptionProviderError";
  }
}

export const disabledTranscriptionProvider: TranscriptionProvider = {
  id: "disabled_transcription",
  kind: "disabled",
  enabled: false,
  name: "disabled",
  async transcribe(): Promise<TranscriptionOutput> {
    throw new TranscriptionProviderError("Transcription provider is disabled.");
  }
};

export const mockTranscriptionProvider: TranscriptionProvider = {
  id: "mock_transcription",
  kind: "mock",
  enabled: true,
  name: "mock_transcription",
  model: "mock-transcription-v1",
  async transcribe(input: TranscriptionInput): Promise<TranscriptionOutput> {
    assertTranscriptionPolicyAllowsUse(input, false);
    return {
      text:
        input.fixtureTranscript ??
        input.redactedAudioSummary ??
        `Mock transcript for ${input.scopeLabel ?? input.segmentId}.`,
      language: "en",
      confidence: 0.84,
      provider: {
        id: "mock_transcription",
        kind: "mock",
        model: "mock-transcription-v1"
      },
      redactionState: input.policy.redactionState
    };
  }
};

export function buildTranscriptionProvider(
  config: TranscriptionProviderConfig
): TranscriptionProvider {
  if (config.kind === "disabled") return disabledTranscriptionProvider;
  if (config.kind === "mock") return mockTranscriptionProvider;
  if (config.kind === "local") {
    return {
      id: "local_transcription_unavailable",
      kind: "local",
      enabled: false,
      name: "local-transcription-unavailable",
      async transcribe(): Promise<TranscriptionOutput> {
        throw new TranscriptionProviderError("Local transcription provider is not configured.");
      }
    };
  }
  if (!config.baseUrl?.trim()) {
    throw new TranscriptionProviderError(
      "OpenAI-compatible transcription provider requires a base URL."
    );
  }
  if (!config.model?.trim()) {
    throw new TranscriptionProviderError(
      "OpenAI-compatible transcription provider requires a model."
    );
  }
  return createOpenAICompatibleTranscriptionProvider({
    baseUrl: config.baseUrl,
    model: config.model,
    ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
    ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
    ...(config.maxAudioBytes !== undefined ? { maxAudioBytes: config.maxAudioBytes } : {}),
    ...(config.maxDurationMs !== undefined ? { maxDurationMs: config.maxDurationMs } : {})
  });
}

export function createOpenAICompatibleTranscriptionProvider(
  config: OpenAICompatibleTranscriptionProviderConfig
): TranscriptionProvider {
  const endpoint = normalizeAudioTranscriptionsUrl(config.baseUrl);
  const timeoutMs = config.timeoutMs ?? 60_000;
  const maxAudioBytes =
    config.maxAudioBytes ?? DEFAULT_OPENAI_COMPATIBLE_TRANSCRIPTION_MAX_AUDIO_BYTES;
  const maxDurationMs =
    config.maxDurationMs ?? DEFAULT_OPENAI_COMPATIBLE_TRANSCRIPTION_MAX_DURATION_MS;

  return {
    id: "openai_compatible_transcription",
    kind: "openai-compatible",
    enabled: true,
    name: "openai-compatible-transcription",
    model: config.model,
    async transcribe(input: TranscriptionInput): Promise<TranscriptionOutput> {
      assertTranscriptionPolicyAllowsUse(input, true);
      if (!input.audio?.localPath) {
        throw new TranscriptionProviderError(
          "OpenAI-compatible transcription requires a bounded local audio segment."
        );
      }
      if (input.durationMs > maxDurationMs) {
        throw new TranscriptionProviderError(
          `Audio segment exceeds transcription duration budget: ${input.durationMs}ms`
        );
      }
      const sizeBytes = input.audio.sizeBytes ?? (await stat(input.audio.localPath)).size;
      if (sizeBytes > maxAudioBytes) {
        throw new TranscriptionProviderError(
          `Audio segment exceeds transcription size budget: ${sizeBytes} bytes`
        );
      }
      const payload = await buildAudioTranscriptionFormData(input, config.model);
      const response = await postAudioTranscription(endpoint, config.apiKey, payload, timeoutMs);
      return sanitizeTranscriptionOutput(response, input, {
        id: "openai_compatible_transcription",
        kind: "openai-compatible",
        model: config.model
      });
    }
  };
}

export function normalizeAudioTranscriptionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    throw new TranscriptionProviderError(
      "OpenAI-compatible transcription provider requires a base URL."
    );
  }
  const withoutTrailing = trimmed.replace(/\/+$/, "");
  if (withoutTrailing.endsWith("/audio/transcriptions")) return withoutTrailing;
  if (withoutTrailing.endsWith("/v1")) return `${withoutTrailing}/audio/transcriptions`;
  return `${withoutTrailing}/v1/audio/transcriptions`;
}

export function assertTranscriptionPolicyAllowsUse(
  input: TranscriptionInput,
  external: boolean
): void {
  if (!input.policy.canUseForAI) {
    throw new TranscriptionProviderError("Transcription source policy does not allow AI use.");
  }
  if (input.policy.redactionState === "failed") {
    throw new TranscriptionProviderError(
      "Transcription redaction failed; provider call is blocked."
    );
  }
  if (external && !input.policy.allowExternal) {
    throw new TranscriptionProviderError(
      "Transcription source policy does not allow external provider use."
    );
  }
}

async function buildAudioTranscriptionFormData(
  input: TranscriptionInput,
  model: string
): Promise<FormData> {
  if (!input.audio?.localPath) {
    throw new TranscriptionProviderError("Audio local path is required.");
  }
  const bytes = await readFile(input.audio.localPath);
  const blob = new Blob([new Uint8Array(bytes)], {
    type: input.audio.mimeType ?? "application/octet-stream"
  });
  const form = new FormData();
  form.append("file", blob, input.audio.filename ?? basename(input.audio.localPath));
  form.append("model", model);
  form.append("response_format", "json");
  return form;
}

async function postAudioTranscription(
  endpoint: string,
  apiKey: string | undefined,
  payload: FormData,
  timeoutMs: number
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {};
    if (apiKey?.trim()) headers.Authorization = `Bearer ${apiKey}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: payload,
      signal: controller.signal
    });
    const body = await response.text();
    if (!response.ok) {
      throw new TranscriptionProviderError(
        `OpenAI-compatible transcription provider returned HTTP ${response.status}: ${body.slice(
          0,
          300
        )}`
      );
    }
    try {
      return JSON.parse(body) as unknown;
    } catch (error) {
      throw new TranscriptionProviderError(
        `OpenAI-compatible transcription provider returned invalid JSON: ${String(error)}`
      );
    }
  } catch (error) {
    if (error instanceof TranscriptionProviderError) throw error;
    throw new TranscriptionProviderError(
      `OpenAI-compatible transcription request failed: ${String(error)}`
    );
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeTranscriptionOutput(
  raw: unknown,
  input: TranscriptionInput,
  provider: TranscriptionOutput["provider"]
): TranscriptionOutput {
  const object = isRecord(raw) ? raw : {};
  const text = readText(object.text);
  if (!text) {
    throw new TranscriptionProviderError(
      "OpenAI-compatible transcription provider returned empty transcript text."
    );
  }
  const output: TranscriptionOutput = {
    text,
    confidence: readConfidence(object.confidence),
    provider,
    redactionState: input.policy.redactionState
  };
  const language = readText(object.language);
  if (language) output.language = language;
  return output;
}

function readText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.72;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
