import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { ActivitySession, Event } from "@orbit/core";
import { createStableId, evidenceFromEvent, hashObject } from "@orbit/core";
import {
  createOpenAICompatibleProvider,
  mockAiProvider,
  normalizeChatCompletionsUrl,
  testAIProviderConnection
} from "./index";

const servers: Array<{ close(callback?: (error?: Error) => void): void }> = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
});

describe("AI providers", () => {
  it("normalizes OpenAI-compatible chat completion URLs", () => {
    expect(normalizeChatCompletionsUrl("https://api.openai.com")).toBe(
      "https://api.openai.com/v1/chat/completions"
    );
    expect(normalizeChatCompletionsUrl("https://api.openai.com/v1")).toBe(
      "https://api.openai.com/v1/chat/completions"
    );
    expect(normalizeChatCompletionsUrl("https://openrouter.ai/api/v1")).toBe(
      "https://openrouter.ai/api/v1/chat/completions"
    );
    expect(normalizeChatCompletionsUrl("http://localhost:1234/v1/chat/completions")).toBe(
      "http://localhost:1234/v1/chat/completions"
    );
  });

  it("mock provider produces evidence-backed knowledge drafts", async () => {
    const input = makeDraftInput();
    const draft = await mockAiProvider.draftKnowledge(input);
    expect(draft.keyInsights[0]?.evidenceIds).toEqual([input.events[0]!.id]);
    expect(draft.followUps[0]?.evidenceIds).toEqual([input.events[1]!.id]);
  });

  it("calls /v1/chat/completions and drops unknown evidence IDs", async () => {
    const input = makeDraftInput();
    let requestedPath = "";
    let requestBody: unknown;
    const baseUrl = await startProviderServer(async (request, response) => {
      requestedPath = request.url ?? "";
      requestBody = JSON.parse(await readRequestBody(request));
      writeJson(response, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Provider draft",
                description: "Provider generated summary.",
                keyInsights: [
                  { text: "Valid insight", evidenceIds: [input.events[0]!.id] },
                  { text: "Invalid insight", evidenceIds: ["missing_event"] }
                ],
                decisions: [],
                blockers: [],
                followUps: [],
                confidence: 0.92
              })
            }
          }
        ]
      });
    });

    const provider = createOpenAICompatibleProvider({
      baseUrl,
      model: "test-model",
      apiKey: "test-key"
    });
    const draft = await provider.draftKnowledge(input);

    expect(requestedPath).toBe("/v1/chat/completions");
    expect(isRecord(requestBody) ? requestBody.model : undefined).toBe("test-model");
    expect(isRecord(requestBody) ? requestBody.max_tokens : undefined).toBe(1200);
    expect(draft.keyInsights).toEqual([
      { text: "Valid insight", evidenceIds: [input.events[0]!.id] }
    ]);
    expect(draft.confidence).toBe(0.92);
  });

  it("can use max_completion_tokens for draft Knowledge requests", async () => {
    const input = makeDraftInput();
    let requestBody: unknown;
    const baseUrl = await startProviderServer(async (request, response) => {
      requestBody = JSON.parse(await readRequestBody(request));
      writeJson(response, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Provider draft",
                description: "Provider generated summary.",
                keyInsights: [{ text: "Valid insight", evidenceIds: [input.events[0]!.id] }],
                decisions: [],
                blockers: [],
                followUps: [],
                confidence: 0.92
              })
            }
          }
        ]
      });
    });

    const provider = createOpenAICompatibleProvider({
      baseUrl,
      model: "test-model",
      maxTokens: 640,
      tokenLimitParameter: "max_completion_tokens"
    });
    await provider.draftKnowledge(input);

    expect(isRecord(requestBody) ? requestBody.max_completion_tokens : undefined).toBe(640);
    expect(isRecord(requestBody) && "max_tokens" in requestBody).toBe(false);
  });

  it("retries without response_format when a compatible endpoint rejects it", async () => {
    const input = makeDraftInput();
    let requests = 0;
    const baseUrl = await startProviderServer(async (request, response) => {
      requests += 1;
      const body = JSON.parse(await readRequestBody(request));
      if (isRecord(body) && "response_format" in body) {
        response.statusCode = 400;
        response.end("unsupported response_format");
        return;
      }
      writeJson(response, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Retry draft",
                description: "Retried without response_format.",
                keyInsights: [{ text: "Retried insight", evidenceIds: [input.events[0]!.id] }],
                decisions: [],
                blockers: [],
                followUps: [],
                confidence: 0.8
              })
            }
          }
        ]
      });
    });

    const provider = createOpenAICompatibleProvider({ baseUrl, model: "test-model" });
    const draft = await provider.draftKnowledge(input);

    expect(requests).toBe(2);
    expect(draft.title).toBe("Retry draft");
  });

  it("tests an OpenAI-compatible connection without sending Orbit evidence", async () => {
    let requestBody: unknown;
    const baseUrl = await startProviderServer(async (request, response) => {
      requestBody = JSON.parse(await readRequestBody(request));
      writeJson(response, {
        choices: [
          {
            message: {
              content: "orbit-ok"
            }
          }
        ]
      });
    });

    const result = await testAIProviderConnection({
      kind: "openai-compatible",
      baseUrl,
      model: "test-model",
      apiKey: "test-key"
    });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe("openai-compatible");
    expect(result.model).toBe("test-model");
    expect(isRecord(requestBody) ? requestBody.model : undefined).toBe("test-model");
    expect(isRecord(requestBody) ? requestBody.max_tokens : undefined).toBe(256);
    expect(isRecord(requestBody) && "response_format" in requestBody).toBe(false);
    expect(JSON.stringify(requestBody)).not.toContain("evidence");
  });

  it("can use max_completion_tokens for connection tests", async () => {
    let requestBody: unknown;
    const baseUrl = await startProviderServer(async (request, response) => {
      requestBody = JSON.parse(await readRequestBody(request));
      writeJson(response, {
        choices: [
          {
            message: {
              content: "orbit-ok"
            }
          }
        ]
      });
    });

    await testAIProviderConnection({
      kind: "openai-compatible",
      baseUrl,
      model: "test-model",
      testMaxTokens: 512,
      tokenLimitParameter: "max_completion_tokens"
    });

    expect(isRecord(requestBody) ? requestBody.max_completion_tokens : undefined).toBe(512);
    expect(isRecord(requestBody) && "max_tokens" in requestBody).toBe(false);
  });

  it("surfaces provider error messages from failed connection tests", async () => {
    const baseUrl = await startProviderServer(async (_request, response) => {
      response.statusCode = 503;
      writeJson(response, {
        error: {
          message: "Service temporarily unavailable",
          type: "api_error"
        }
      });
    });

    await expect(
      testAIProviderConnection({
        kind: "openai-compatible",
        baseUrl,
        model: "test-model"
      })
    ).rejects.toThrow("HTTP 503: Service temporarily unavailable");
  });
});

async function startProviderServer(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void> | void
): Promise<string> {
  const server = createServer((request, response) => {
    void Promise.resolve(handler(request, response)).catch((error: unknown) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function writeJson(response: ServerResponse, value: unknown): void {
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(value));
}

function makeDraftInput(): { session: ActivitySession; events: Event[] } {
  const events = [makeEvent("1", "message"), makeEvent("2", "todo")];
  return {
    events,
    session: {
      id: "activity_session_1",
      schemaVersion: 1,
      title: "Work on Orbit provider",
      startAt: "2026-05-20T09:00:00.000Z",
      endAt: "2026-05-20T09:15:00.000Z",
      durationSeconds: 900,
      sourceKinds: ["codex"],
      apps: ["Codex"],
      eventCount: events.length,
      eventIds: events.map((event) => event.id),
      project: "orbit",
      summary: "Implemented provider support.",
      evidence: events.map((event) => evidenceFromEvent(event, event.content.title)),
      localState: {
        rawAvailable: true,
        indexed: true
      },
      privacy: {
        sensitivity: "internal",
        retentionPolicyId: "default"
      },
      createdAt: "2026-05-20T09:15:00.000Z",
      updatedAt: "2026-05-20T09:15:00.000Z"
    }
  };
}

function makeEvent(id: string, type: Event["type"]): Event {
  const source = {
    kind: "codex" as const,
    adapterId: "fixture_codex",
    externalId: id,
    pointer: `fixture://codex/provider#${id}`
  };
  const input = {
    source,
    occurredAt: `2026-05-20T09:0${id}:00.000Z`,
    type,
    title: type === "todo" ? "Follow up on provider settings" : "Inspect provider architecture"
  };
  return {
    id: createStableId("event", input),
    schemaVersion: 1,
    source,
    occurredAt: input.occurredAt,
    observedAt: input.occurredAt,
    context: { app: "Codex", project: "orbit" },
    type,
    content: { title: input.title },
    privacy: {
      sensitivity: "internal",
      retentionPolicyId: "default",
      redactionState: "none"
    },
    hash: hashObject(input)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
