import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createOpenAICompatibleTranscriptionProvider,
  mockTranscriptionProvider,
  normalizeAudioTranscriptionsUrl
} from "./transcription";

const servers: Array<{ close(callback?: (error?: Error) => void): void }> = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("transcription providers", () => {
  it("normalizes OpenAI-compatible audio transcription URLs", () => {
    expect(normalizeAudioTranscriptionsUrl("https://api.openai.com")).toBe(
      "https://api.openai.com/v1/audio/transcriptions"
    );
    expect(normalizeAudioTranscriptionsUrl("https://api.openai.com/v1")).toBe(
      "https://api.openai.com/v1/audio/transcriptions"
    );
    expect(normalizeAudioTranscriptionsUrl("http://localhost:1234/v1/audio/transcriptions")).toBe(
      "http://localhost:1234/v1/audio/transcriptions"
    );
  });

  it("produces deterministic mock transcripts and enforces policy", async () => {
    const input = {
      segmentId: "segment_1",
      segmentHash: "segment_hash_1",
      startedAt: "2026-05-21T00:10:00.000Z",
      durationMs: 12_000,
      fixtureTranscript: "Discussed bounded audio transcription.",
      policy: {
        canUseForAI: true,
        allowExternal: false,
        redactionState: "none" as const
      }
    };

    const output = await mockTranscriptionProvider.transcribe(input);
    expect(output.provider.kind).toBe("mock");
    expect(output.text).toContain("bounded audio");

    await expect(
      mockTranscriptionProvider.transcribe({
        ...input,
        policy: {
          ...input.policy,
          canUseForAI: false
        }
      })
    ).rejects.toThrow(/does not allow AI/);
  });

  it("calls OpenAI-compatible audio transcription with bounded audio bytes", async () => {
    const audioPath = writeFixtureAudio();
    let requestedPath = "";
    let authHeader = "";
    let contentType = "";
    let requestBody = "";
    const baseUrl = await startProviderServer(async (request, response) => {
      requestedPath = request.url ?? "";
      authHeader = request.headers.authorization ?? "";
      contentType = request.headers["content-type"] ?? "";
      requestBody = await readRequestBody(request);
      writeJson(response, {
        text: "Provider transcript for bounded audio.",
        language: "en",
        confidence: 0.93
      });
    });

    const provider = createOpenAICompatibleTranscriptionProvider({
      baseUrl,
      model: "whisper-test",
      apiKey: "test-key",
      maxAudioBytes: 1024,
      maxDurationMs: 30_000
    });
    const output = await provider.transcribe({
      segmentId: "segment_1",
      segmentHash: "segment_hash_1",
      startedAt: "2026-05-21T00:10:00.000Z",
      durationMs: 12_000,
      audio: {
        localPath: audioPath,
        mimeType: "audio/wav",
        filename: "segment.wav"
      },
      policy: {
        canUseForAI: true,
        allowExternal: true,
        redactionState: "none"
      }
    });

    expect(requestedPath).toBe("/v1/audio/transcriptions");
    expect(authHeader).toBe("Bearer test-key");
    expect(contentType).toContain("multipart/form-data");
    expect(requestBody).toContain("whisper-test");
    expect(requestBody).toContain("segment.wav");
    expect(output.provider.kind).toBe("openai-compatible");
    expect(output.text).toContain("Provider transcript");
    expect(output.confidence).toBe(0.93);
  });

  it("blocks external transcription when policy or budgets disallow it", async () => {
    const audioPath = writeFixtureAudio();
    const provider = createOpenAICompatibleTranscriptionProvider({
      baseUrl: "http://localhost:1",
      model: "whisper-test",
      maxAudioBytes: 1,
      maxDurationMs: 1_000
    });
    const input = {
      segmentId: "segment_1",
      segmentHash: "segment_hash_1",
      startedAt: "2026-05-21T00:10:00.000Z",
      durationMs: 12_000,
      audio: {
        localPath: audioPath,
        mimeType: "audio/wav"
      },
      policy: {
        canUseForAI: true,
        allowExternal: false,
        redactionState: "none" as const
      }
    };

    await expect(provider.transcribe(input)).rejects.toThrow(/external provider/i);
    await expect(
      provider.transcribe({
        ...input,
        durationMs: 12_000,
        policy: {
          ...input.policy,
          allowExternal: true
        }
      })
    ).rejects.toThrow(/duration budget/i);
  });
});

function writeFixtureAudio(): string {
  const dir = mkdtempSync(join(tmpdir(), "orbit-transcription-test-"));
  tempDirs.push(dir);
  const audioPath = join(dir, "segment.wav");
  writeFileSync(audioPath, Buffer.from("RIFF....WAVEfmt fake orbit audio"));
  return audioPath;
}

async function startProviderServer(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>
): Promise<string> {
  const server = createServer((request, response) => {
    handler(request, response).catch((error) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function writeJson(response: ServerResponse, body: unknown): void {
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}
